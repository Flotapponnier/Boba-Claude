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

      // Create local executor
      const executor = new LocalExecutor({
        workingDir: data.directory || process.cwd(),
      })

      await executor.connect()

      // Find Claude CLI
      const claudePaths = ['claude', '/usr/local/bin/claude', '/usr/bin/claude', process.env.HOME + '/.local/bin/claude']
      let claudePath: string | null = null

      for (const path of claudePaths) {
        if (await executor.fileExists(path) || path === 'claude') {
          claudePath = path
          console.log(`[User Daemon] Found Claude at: ${path}`)
          break
        }
      }

      if (!claudePath) {
        callback({
          success: false,
          error: 'Claude CLI not found. Install with: curl -fsSL https://claude.ai/install.sh | bash',
        })
        await executor.disconnect()
        return
      }

      // Store session
      activeSessions.set(data.sessionId, {
        sessionId: data.sessionId,
        executor,
        workingDir: data.directory || process.cwd(),
        claudePath,
        messageHistory: [],
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

      // Build conversation context
      const conversationContext = session.messageHistory
        .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
        .join('\n\n') + '\n\nAssistant:'

      // Execute Claude
      const command = `cd ${session.workingDir} && echo "${conversationContext.replace(/"/g, '\\"')}" | ${session.claudePath} -p`
      const result = await session.executor.executeCommand(command)

      console.log(`[User Daemon] Claude response for session ${data.sessionId}`)

      // Clean output
      const cleanOutput = result.stdout
        .replace(/Ubuntu.*LTS.*\\n.*\\l/g, '')
        .trim()

      // Add assistant response to history
      session.messageHistory.push({ role: 'assistant', content: cleanOutput })

      // Send output back to relay
      socket.emit('claude_message', {
        sessionId: data.sessionId,
        content: cleanOutput,
      })

      if (result.stderr) {
        console.error(`[User Daemon] stderr:`, result.stderr)
      }
    } catch (error: any) {
      console.error('[User Daemon] Failed to execute Claude:', error)
      socket.emit('error', {
        sessionId: data.sessionId,
        error: error.message || 'Failed to execute command',
      })
    }
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
