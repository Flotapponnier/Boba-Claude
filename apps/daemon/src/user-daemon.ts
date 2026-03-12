#!/usr/bin/env node
/**
 * User Daemon - Personal daemon that runs in user's workspace
 * Inspired by Happy CLI architecture
 *
 * This daemon runs LOCALLY on the user's machine (Coder workspace, laptop, etc.)
 * and connects to the central relay server to receive commands.
 *
 * Flow:
 * 1. User starts this daemon in THEIR workspace → daemon registers with relay
 * 2. Frontend connects to relay → relay routes to THIS daemon
 * 3. Daemon spawns Claude sessions in USER's workspace with access to THEIR code
 *
 * Environment variables:
 * - USER_AUTH_TOKEN: JWT token from Phantom login (required)
 * - RELAY_URL: Relay server URL (default: http://localhost:3001)
 * - LOCAL_MODE: true for local Claude execution, false for SSH (default: true)
 */
import { io as socketClient, Socket as ClientSocket } from 'socket.io-client'
import { LocalExecutor } from './local-executor.js'

const RELAY_URL = process.env.RELAY_URL || 'http://localhost:3001'
const USER_AUTH_TOKEN = process.env.USER_AUTH_TOKEN
const LOCAL_MODE = process.env.LOCAL_MODE !== 'false' // Default to true

interface SessionInfo {
  sessionId: string
  executor: LocalExecutor
  workingDir: string
  claudePath: string
  messageHistory: Array<{ role: 'user' | 'assistant'; content: string }>
}

// Active sessions managed by this daemon
const activeSessions = new Map<string, SessionInfo>()

async function main() {
  console.log(`[User Daemon] Starting daemon in LOCAL mode...`)

  if (!USER_AUTH_TOKEN) {
    console.error('[User Daemon] ERROR: USER_AUTH_TOKEN environment variable is required')
    console.error('[User Daemon] Get your token from the web interface after logging in')
    console.error('[User Daemon] Example: USER_AUTH_TOKEN="your-token" bun src/user-daemon.ts')
    process.exit(1)
  }

  console.log(`[User Daemon] Connecting to relay server at ${RELAY_URL}...`)

  // Connect to relay server as a daemon
  const socket = socketClient(RELAY_URL, {
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: 5,
    auth: {
      token: USER_AUTH_TOKEN,
      clientType: 'daemon',
      workspaceInfo: {
        workingDir: process.cwd(),
        machineId: process.env.MACHINE_ID || 'local',
        connectedAt: new Date(),
      },
    },
  })

  socket.on('connect', () => {
    console.log('[User Daemon] ✓ Connected to relay server')
  })

  socket.on('connect_error', (err) => {
    console.error('[User Daemon] Failed to connect to relay:', err.message)
  })

  socket.on('daemon_registered', (data) => {
    console.log(`[User Daemon] ✓ Registered as daemon for user`)
    console.log('[User Daemon] Ready to receive commands from frontend')
  })

  socket.on('error', (data) => {
    console.error('[User Daemon] Error from relay:', data)
  })

  // Handle create_session from relay
  socket.on('spawn_session', async (data: { sessionId: string; directory: string }, callback) => {
    console.log(`[User Daemon] Creating session ${data.sessionId} in ${data.directory}`)

    try {
      // Check if session already exists
      if (activeSessions.has(data.sessionId)) {
        console.log(`[User Daemon] Session ${data.sessionId} already exists`)
        callback({ success: true, message: 'Session already exists' })
        return
      }

      // Find Claude CLI and node binary using which
      let claudePath: string | null = null
      let nodePath: string | null = null
      try {
        const { execSync } = await import('child_process')
        const whichClaudeResult = execSync('which claude', { encoding: 'utf8' }).trim()
        const whichNodeResult = execSync('which node', { encoding: 'utf8' }).trim()
        if (whichClaudeResult) {
          claudePath = whichClaudeResult
          console.log(`[User Daemon] Found Claude at: ${claudePath}`)
        }
        if (whichNodeResult) {
          nodePath = whichNodeResult
          console.log(`[User Daemon] Found node at: ${nodePath}`)
        }
      } catch (error) {
        // which failed, try common paths
        const claudePaths = ['/usr/local/bin/claude', '/usr/bin/claude', process.env.HOME + '/.local/bin/claude', process.env.HOME + '/.bun/bin/claude']
        for (const path of claudePaths) {
          try {
            const { accessSync } = await import('fs')
            accessSync(path)
            claudePath = path
            console.log(`[User Daemon] Found Claude at: ${path}`)
            break
          } catch {}
        }
      }

      if (!claudePath) {
        callback({
          success: false,
          error: 'Claude CLI not found. Install with: curl -fsSL https://claude.ai/install.sh | bash',
        })
        return
      }

      // Create local executor with Claude path and node path
      const executor = new LocalExecutor({
        workingDir: data.directory || process.cwd(),
        claudePath,
        nodePath: nodePath || undefined, // Use absolute node path if found
      })

      await executor.connect()

      // Setup permission callback
      executor.setPermissionCallback((request) => {
        console.log(`[User Daemon] Permission request for session ${data.sessionId}: ${request.toolName}`)
        // Forward to relay → frontend
        socket.emit('permission_request', {
          sessionId: data.sessionId,
          requestId: request.requestId,
          toolName: request.toolName,
          input: request.input,
        })
      })

      // Store session
      activeSessions.set(data.sessionId, {
        sessionId: data.sessionId,
        executor,
        workingDir: data.directory || process.cwd(),
        claudePath,
        messageHistory: [],
      })

      // Start interactive Claude session with streaming callbacks
      await executor.startInteractiveSession({
        onOutput: (output: string) => {
          console.log(`[User Daemon] Claude output for session ${data.sessionId}`)
          // Stream output to relay in real-time
          socket.emit('claude_message', {
            sessionId: data.sessionId,
            content: output,
          })
        },
        onError: (error: string) => {
          console.error(`[User Daemon] Claude error for session ${data.sessionId}:`, error)
          socket.emit('error', {
            sessionId: data.sessionId,
            error,
          })
        },
        onExit: (code: number | null) => {
          console.log(`[User Daemon] Claude exited for session ${data.sessionId} with code ${code}`)
          activeSessions.delete(data.sessionId)
          socket.emit('session_ended', {
            sessionId: data.sessionId,
            code,
          })
        },
      })

      console.log(`[User Daemon] ✓ Session ${data.sessionId} ready`)
      callback({ success: true })

      // Notify relay that session is ready
      socket.emit('session_ready', { sessionId: data.sessionId })
    } catch (error: any) {
      console.error('[User Daemon] Failed to create session:', error)
      callback({ success: false, error: error.message })
    }
  })

  // Handle user messages from relay
  socket.on('user_message', async (data: { sessionId: string; content: string }) => {
    console.log(`[User Daemon] Received message for session ${data.sessionId}`)

    const session = activeSessions.get(data.sessionId)
    if (!session) {
      console.error(`[User Daemon] Session ${data.sessionId} not found`)
      socket.emit('error', { sessionId: data.sessionId, error: 'Session not found' })
      return
    }

    try {
      // Add user message to history
      session.messageHistory.push({ role: 'user', content: data.content })

      // Send message to interactive Claude process
      await session.executor.sendMessage(data.content)

      console.log(`[User Daemon] Message sent to Claude for session ${data.sessionId}`)
    } catch (error: any) {
      console.error('[User Daemon] Failed to send message to Claude:', error)
      socket.emit('error', {
        sessionId: data.sessionId,
        error: error.message || 'Failed to send message',
      })
    }
  })

  // Handle permission responses from relay (frontend → daemon)
  socket.on('permission_response', async (data: { sessionId: string; requestId: string; approved: boolean }) => {
    console.log(`[User Daemon] Permission response for session ${data.sessionId}: ${data.approved ? 'approved' : 'denied'}`)

    const session = activeSessions.get(data.sessionId)
    if (!session) {
      console.error(`[User Daemon] Session ${data.sessionId} not found`)
      return
    }

    // Forward response to executor
    session.executor.respondToPermission(data.requestId, data.approved)
  })

  // Handle stop_session from relay
  socket.on('stop_session', async (data: { sessionId: string }, callback) => {
    console.log(`[User Daemon] Stopping session ${data.sessionId}`)

    const session = activeSessions.get(data.sessionId)
    if (session) {
      await session.executor.disconnect()
      activeSessions.delete(data.sessionId)
      socket.emit('session_ended', { sessionId: data.sessionId, code: 0 })
      callback({ success: true })
    } else {
      callback({ success: false, error: 'Session not found' })
    }
  })

  socket.on('disconnect', () => {
    console.log('[User Daemon] Disconnected from relay')
  })

  process.on('SIGINT', async () => {
    console.log('\n[User Daemon] Shutting down...')

    // Cleanup all sessions
    for (const [sessionId, session] of activeSessions) {
      console.log(`[User Daemon] Closing session ${sessionId}`)
      await session.executor.disconnect()
    }

    socket.disconnect()
    process.exit(0)
  })
}

main().catch((error) => {
  console.error('[User Daemon] Fatal error:', error)
  process.exit(1)
})
