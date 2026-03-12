#!/usr/bin/env node
/**
 * Cloud Daemon - Centralized daemon that manages Claude sessions via SSH
 * This daemon runs on the VPS and connects to user's remote machines via SSH
 */
import { Server as SocketServer, Socket } from 'socket.io'
import { createServer } from 'node:http'
import { spawn, ChildProcess } from 'node:child_process'
import { SSHExecutor, SSHConfig } from './ssh-executor.js'
import { PrismaClient } from '@prisma/client'

const WS_PORT = 3001
const API_URL = process.env.API_URL || 'http://localhost:3002'

// Initialize Prisma
const prisma = new PrismaClient()

interface SessionInfo {
  sessionId: string
  userId: string
  sshExecutor: SSHExecutor
  sshConfig: SSHConfig
  claudePath: string
  workspaceId: string
  messageHistory: Array<{ role: 'user' | 'assistant'; content: string }>
}

// Active sessions: sessionId -> SessionInfo
const activeSessions = new Map<string, SessionInfo>()

// User connections: socket.id -> userId
const userConnections = new Map<string, string>()

async function fetchWorkspace(userId: string, workspaceId?: string) {
  const response = await fetch(`${API_URL}/api/workspaces/${userId}/active`, {
    headers: {
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error('No active workspace found')
  }

  return await response.json()
}

async function spawnClaudeSession(
  sessionId: string,
  userId: string,
  workspaceId: string,
  frontendSocket: Socket
): Promise<void> {
  console.log(`[Cloud Daemon] Spawning Claude session ${sessionId} for user ${userId}`)

  // Fetch workspace config from API
  const workspace = await fetchWorkspace(userId, workspaceId)

  // Load SSH private key if no password
  let privateKey: Buffer | undefined
  if (!workspace.sshPassword) {
    const fs = await import('fs')
    const os = await import('os')
    const path = await import('path')

    // Try multiple common key paths
    const keyPaths = [
      path.join(os.homedir(), '.ssh', 'id_ed25519'),
      path.join(os.homedir(), '.ssh', 'id_rsa'),
      path.join(os.homedir(), '.ssh', 'id_ecdsa'),
    ]

    let keyFound = false
    for (const keyPath of keyPaths) {
      try {
        privateKey = fs.readFileSync(keyPath)
        console.log(`[Cloud Daemon] Using SSH key: ${keyPath}`)
        keyFound = true
        break
      } catch (err) {
        // Try next key
      }
    }

    if (!keyFound) {
      throw new Error(`No SSH password and couldn't find SSH key in: ${keyPaths.join(', ')}`)
    }
  }

  // Create SSH executor
  const sshConfig: SSHConfig = {
    host: workspace.sshHost,
    port: workspace.sshPort || 22,
    username: workspace.sshUser,
    password: workspace.sshPassword || undefined,
    privateKey,
    workingDir: workspace.workingDir || '/home/rescue',
  }

  const sshExecutor = new SSHExecutor(sshConfig)
  await sshExecutor.connect()

  // Check if Claude CLI is installed on remote (try multiple paths)
  const claudePaths = ['/usr/bin/claude', '/usr/local/bin/claude', '/home/rescue/.local/bin/claude']
  let claudePath: string | null = null

  for (const path of claudePaths) {
    if (await sshExecutor.fileExists(path)) {
      claudePath = path
      console.log(`[Cloud Daemon] Found Claude at: ${path}`)
      break
    }
  }

  if (!claudePath) {
    frontendSocket.emit('error', {
      sessionId,
      error: `Claude CLI not found in: ${claudePaths.join(', ')}`,
    })
    await sshExecutor.disconnect()
    return
  }

  // Store session info (SSH executor stays connected for multiple calls)
  activeSessions.set(sessionId, {
    sessionId,
    userId,
    sshExecutor,
    sshConfig,
    claudePath,
    workspaceId,
    messageHistory: [],
  })

  frontendSocket.emit('session_ready', { sessionId })
}

async function main() {
  console.log('[Cloud Daemon] Starting centralized cloud daemon...')

  const httpServer = createServer()

  const io = new SocketServer(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (!origin) return callback(null, true)
        if (origin.includes('localhost') || origin.includes('127.0.0.1')) return callback(null, true)
        if (origin.match(/https?:\/\/\d+--/)) return callback(null, true)
        if (origin.includes('vercel.app')) return callback(null, true)
        if (origin.includes('ngrok-free.app') || origin.includes('ngrok.io') || origin.includes('ngrok-free.dev')) return callback(null, true)
        callback(new Error('Not allowed by CORS'))
      },
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket'],
  })

  io.on('connection', async (socket) => {
    const authToken = socket.handshake.auth?.token
    const clientType = socket.handshake.auth?.clientType

    if (!authToken) {
      console.error('[Cloud Daemon] No auth token provided')
      socket.emit('error', { error: 'Authentication required' })
      socket.disconnect()
      return
    }

    // Verify token with API
    let userId: string
    try {
      const response = await fetch(`${API_URL}/api/auth/verify`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      })

      if (!response.ok) {
        throw new Error('Invalid token')
      }

      const data = await response.json()
      userId = data.userId
      console.log(`[Cloud Daemon] Authenticated user: ${userId}`)
    } catch (error) {
      console.error('[Cloud Daemon] Authentication failed:', error)
      socket.emit('error', { error: 'Invalid authentication token' })
      socket.disconnect()
      return
    }

    userConnections.set(socket.id, userId)

    console.log(`[Cloud Daemon] Setting up event handlers for user ${userId}`)

    // Create session
    socket.on('create_session', async (data: { sessionId: string; workspaceId?: string }) => {
      console.log(`[Cloud Daemon] Received create_session event:`, data)

      // Check if session already exists in memory (resume case)
      let existingSession = activeSessions.get(data.sessionId)
      if (existingSession) {
        console.log(`[Cloud Daemon] Session ${data.sessionId} already exists in memory, resuming with ${existingSession.messageHistory.length} messages...`)
        socket.emit('session_ready', { sessionId: data.sessionId })

        // Send message history back to frontend
        if (existingSession.messageHistory.length > 0) {
          socket.emit('session_history', {
            sessionId: data.sessionId,
            messages: existingSession.messageHistory,
          })
        }
        return
      }

      // Check if session exists in DB (daemon was restarted)
      const dbSession = await prisma.session.findUnique({
        where: { id: data.sessionId },
        include: {
          messages: {
            orderBy: { createdAt: 'asc' },
          },
        },
      })

      if (dbSession && dbSession.accountId === userId) {
        console.log(`[Cloud Daemon] Found session ${data.sessionId} in DB with ${dbSession.messages.length} messages, restoring...`)

        // Restore message history from DB
        const messageHistory = dbSession.messages.map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        }))

        // Recreate session in memory by spawning SSH connection
        try {
          await spawnClaudeSession(data.sessionId, userId, data.workspaceId || 'default', socket)

          // Load history into memory
          const session = activeSessions.get(data.sessionId)
          if (session) {
            session.messageHistory = messageHistory
            console.log(`[Cloud Daemon] Restored ${messageHistory.length} messages from DB into session memory`)

            // Send history to frontend
            if (messageHistory.length > 0) {
              socket.emit('session_history', {
                sessionId: data.sessionId,
                messages: messageHistory,
              })
            }
          }
        } catch (error: any) {
          console.error('[Cloud Daemon] Failed to restore session:', error)
          socket.emit('error', {
            sessionId: data.sessionId,
            error: error.message || 'Failed to restore session',
          })
        }
        return
      }

      try {
        await spawnClaudeSession(
          data.sessionId,
          userId,
          data.workspaceId || 'default',
          socket
        )

        // Create session in DB if it doesn't exist
        await prisma.session.upsert({
          where: { id: data.sessionId },
          create: {
            id: data.sessionId,
            accountId: userId,
            title: 'New Chat',
          },
          update: {},
        })
      } catch (error: any) {
        console.error('[Cloud Daemon] Failed to create session:', error)
        socket.emit('error', {
          sessionId: data.sessionId,
          error: error.message || 'Failed to create session',
        })
      }
    })

    // Send message to Claude
    socket.on('message', async (data: { sessionId: string; content: string }) => {
      console.log(`[Cloud Daemon] Received message for session ${data.sessionId}:`, data.content)
      const session = activeSessions.get(data.sessionId)
      if (!session) {
        socket.emit('error', {
          sessionId: data.sessionId,
          error: 'Session not found',
        })
        return
      }

      console.log(`[Cloud Daemon] Executing Claude command via SSH`)

      // Add user message to history
      session.messageHistory.push({ role: 'user', content: data.content })

      // Save user message to DB
      await prisma.message.create({
        data: {
          sessionId: data.sessionId,
          role: 'user',
          content: data.content,
        },
      })

      // Execute claude with -p flag (print mode) via SSH
      // Build full conversation context
      const conversationContext = session.messageHistory
        .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
        .join('\n\n') + '\n\nAssistant:'

      try {
        const command = `cd ${session.sshConfig.workingDir} && echo "${conversationContext.replace(/"/g, '\\"')}" | ${session.claudePath} -p`
        const result = await session.sshExecutor.executeCommand(command)

        console.log(`[Claude ${session.sessionId}] stdout:`, result.stdout)

        // Filter out Ubuntu banner and other SSH noise
        const cleanOutput = result.stdout
          .replace(/Ubuntu.*LTS.*\\n.*\\l/g, '')
          .trim()

        // Add assistant response to history
        session.messageHistory.push({ role: 'assistant', content: cleanOutput })

        // Save assistant response to DB
        await prisma.message.create({
          data: {
            sessionId: data.sessionId,
            role: 'assistant',
            content: cleanOutput,
          },
        })

        // Update session timestamp
        await prisma.session.update({
          where: { id: data.sessionId },
          data: { updatedAt: new Date() },
        })

        // Send output back to client
        socket.emit('output', {
          sessionId: data.sessionId,
          content: cleanOutput,
        })

        if (result.stderr) {
          console.error(`[Claude ${session.sessionId}] stderr:`, result.stderr)
        }

        // Don't end session - keep it alive for continuation
        // socket.emit('session_ended', {
        //   sessionId: data.sessionId,
        //   code: 0
        // })
      } catch (error: any) {
        console.error(`[Cloud Daemon] Failed to execute Claude command:`, error)
        socket.emit('error', {
          sessionId: data.sessionId,
          error: error.message || 'Failed to execute command',
        })
      }
    })

    // Cancel session (no-op for now, as each message is one-shot)
    socket.on('cancel_session', (data: { sessionId: string }) => {
      socket.emit('session_cancelled', { sessionId: data.sessionId })
    })

    // Delete session
    socket.on('delete_session', async (data: { sessionId: string }) => {
      const session = activeSessions.get(data.sessionId)
      if (session) {
        if (session.sshExecutor) {
          await session.sshExecutor.disconnect()
        }
        activeSessions.delete(data.sessionId)
        socket.emit('session_ended', { sessionId: data.sessionId, code: 0 })
      }
    })

    socket.on('disconnect', () => {
      console.log(`[Cloud Daemon] User ${userId} disconnected`)
      userConnections.delete(socket.id)
    })
  })

  httpServer.listen(WS_PORT, () => {
    console.log(`[Cloud Daemon] Cloud daemon listening on port ${WS_PORT}`)
    console.log('[Cloud Daemon] Ready to manage Claude sessions via SSH')
  })

  process.on('SIGINT', async () => {
    console.log('\n[Cloud Daemon] Shutting down...')

    // Kill all active sessions
    for (const [sessionId, session] of activeSessions) {
      console.log(`[Cloud Daemon] Closing session ${sessionId}`)
      if (session.sshExecutor) {
        await session.sshExecutor.disconnect()
      }
    }

    process.exit(0)
  })
}

main().catch((error) => {
  console.error('[Cloud Daemon] Fatal error:', error)
  process.exit(1)
})
