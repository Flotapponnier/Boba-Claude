#!/usr/bin/env node
import { Server } from 'socket.io'
import { createServer } from 'node:http'
import { spawnClaude } from './claude-spawner.js'
import { ChildProcess } from 'node:child_process'
import { HookServer } from './hook-server.js'

const WS_PORT = 3001
const HOOK_PORT = 3002

// Multi-session management: Map sessionId -> Claude process
const claudeSessions = new Map<string, { process: ChildProcess; claudeSessionId: string | null }>()
let hookServer: HookServer | null = null
let frontendSocket: any = null
let pendingTools = new Map<string, { resolve: (allowed: boolean) => void; toolUse: any }>()

// Helper: Create Claude output handler for a specific session
function createClaudeOutputHandler(uiSessionId: string, socket: any) {
  return async (data: string) => {
    console.log(`[Output Handler ${uiSessionId}] Got data: ${data.length} bytes`)
    const lines = data.split('\n').filter(line => line.trim())
    console.log(`[Output Handler ${uiSessionId}] Split into ${lines.length} lines`)
    for (const line of lines) {
      try {
        const message = JSON.parse(line)
        console.log(`[Output Handler ${uiSessionId}] Parsed message type: ${message.type}`)

        // Extract Claude's internal session ID from system/init message
        if (message.type === 'system' && message.subtype === 'init' && message.session_id) {
          const sessionInfo = claudeSessions.get(uiSessionId)
          if (sessionInfo && !sessionInfo.claudeSessionId) {
            sessionInfo.claudeSessionId = message.session_id
            console.log(`[Boba Daemon] Session ${uiSessionId} got Claude session ID: ${message.session_id}`)

            // Notify frontend that session is ready
            socket.emit('session_ready', {
              sessionId: uiSessionId,
              claudeSessionId: message.session_id,
            })
          }
        }

        // Forward assistant messages to frontend
        if (message.type === 'assistant') {
          console.log(`[Output Handler ${uiSessionId}] Processing assistant message`)
          const messageObj = message.message
          console.log(`[Output Handler ${uiSessionId}] messageObj exists:`, !!messageObj)
          if (messageObj && Array.isArray(messageObj.content)) {
            console.log(`[Output Handler ${uiSessionId}] Content array length:`, messageObj.content.length)
            // Extract text
            const text = messageObj.content
              .filter((c: any) => c.type === 'text')
              .map((c: any) => c.text)
              .join('')

            console.log(`[Output Handler ${uiSessionId}] Extracted text length:`, text.length)
            console.log(`[Output Handler ${uiSessionId}] Text content:`, text.substring(0, 100))

            // Extract tool uses
            const toolUses = messageObj.content
              .filter((c: any) => c.type === 'tool_use')

            // Send text if present
            if (text) {
              console.log(`[Output Handler ${uiSessionId}] Emitting claude_message to frontend`)
              socket.emit('claude_message', {
                sessionId: uiSessionId,
                message: {
                  type: 'text',
                  text,
                  role: 'assistant',
                },
              })
              console.log(`[Output Handler ${uiSessionId}] Message emitted`)
            }

            // Send tool uses
            for (const toolUse of toolUses) {
              console.log(`[Boba Daemon] Session ${uiSessionId} - Tool executed: ${toolUse.name}`)
              socket.emit('claude_message', {
                sessionId: uiSessionId,
                tool: {
                  type: 'tool_use',
                  id: toolUse.id,
                  name: toolUse.name,
                  input: toolUse.input,
                },
              })
            }
          }
        }
      } catch (e) {
        // Not JSON, log it
        console.log(`[Claude Session ${uiSessionId}]`, data)
      }
    }
  }
}

// Helper: Spawn Claude process for a session
function spawnClaudeForSession(sessionId: string, socket: any) {
  console.log(`[Boba Daemon] Spawning Claude for session ${sessionId}`)

  const process = spawnClaude({
    hookPort: HOOK_PORT,
    onOutput: createClaudeOutputHandler(sessionId, socket),
    onExit: (code) => {
      console.log(`[Boba Daemon] Claude for session ${sessionId} exited with code ${code}`)
      claudeSessions.delete(sessionId)

      // Notify frontend
      socket.emit('session_ended', { sessionId, code })
    },
  })

  claudeSessions.set(sessionId, {
    process,
    claudeSessionId: null,
  })
}

async function main() {
  console.log('[Boba Daemon] Starting multi-session daemon...')

  // Create HTTP server for Socket.IO
  const httpServer = createServer()

  // Create Socket.IO server
  const io = new Server(httpServer, {
    cors: {
      origin: 'http://localhost:3000',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  })

  // Start hook server for tool permissions
  hookServer = new HookServer(HOOK_PORT)
  await hookServer.start()

  // Handle frontend connections
  io.on('connection', (socket) => {
    console.log('[Boba Daemon] Frontend connected')
    frontendSocket = socket

    // Connect hook server to frontend socket for permissions
    if (hookServer) {
      hookServer.setSocket(socket)
    }

    // Handle session creation
    socket.on('create_session', (data: { sessionId: string }) => {
      const { sessionId } = data

      // Check if session already exists
      if (claudeSessions.has(sessionId)) {
        console.log(`[Boba Daemon] Session ${sessionId} already exists, emitting session_ready`)
        const sessionInfo = claudeSessions.get(sessionId)
        // Emit session_ready with existing Claude session ID
        if (sessionInfo && sessionInfo.claudeSessionId) {
          socket.emit('session_ready', {
            sessionId,
            claudeSessionId: sessionInfo.claudeSessionId,
          })
        }
        return
      }

      console.log(`[Boba Daemon] Creating session: ${sessionId}`)

      // Spawn Claude process for this session
      spawnClaudeForSession(sessionId, socket)
    })

    // Handle session deletion
    socket.on('delete_session', (data: { sessionId: string }) => {
      const { sessionId } = data
      console.log(`[Boba Daemon] Deleting session: ${sessionId}`)

      const sessionInfo = claudeSessions.get(sessionId)
      if (sessionInfo) {
        sessionInfo.process.kill('SIGTERM')
        claudeSessions.delete(sessionId)
      }
    })

    // Handle cancel - kill and respawn Claude process for the session
    socket.on('cancel_session', (data: { sessionId: string }) => {
      const { sessionId } = data
      console.log(`[Boba Daemon] Cancelling session: ${sessionId}`)

      const sessionInfo = claudeSessions.get(sessionId)
      if (sessionInfo) {
        sessionInfo.process.kill('SIGTERM')
        claudeSessions.delete(sessionId)
      }

      // Respawn fresh Claude process for the session
      spawnClaudeForSession(sessionId, socket)

      // Notify frontend that cancel was processed
      socket.emit('session_cancelled', { sessionId })
    })

    // Handle messages from frontend (with sessionId)
    socket.on('message', (data: { sessionId: string; content: string }) => {
      const { sessionId, content } = data
      console.log(`[Boba Daemon] Message for session ${sessionId}:`, content)

      const sessionInfo = claudeSessions.get(sessionId)
      if (sessionInfo && sessionInfo.process.stdin) {
        const message = JSON.stringify({
          type: 'user',
          message: {
            role: 'user',
            content
          }
        })
        console.log(`[Boba Daemon] Writing to stdin for session ${sessionId}:`, message)
        sessionInfo.process.stdin.write(message + '\n')
        console.log(`[Boba Daemon] Message written to stdin`)
      } else {
        console.error(`[Boba Daemon] No active process for session ${sessionId}`)
        socket.emit('error', {
          sessionId,
          error: 'Session not found or not ready',
        })
      }
    })

    // Handle permission responses from frontend
    socket.on('permission_response', (data: any) => {
      console.log('[Boba Daemon] Permission response:', data)
      const pending = pendingTools.get(data.requestId)
      if (pending) {
        pending.resolve(data.allowed)
        pendingTools.delete(data.requestId)
      }
    })

    socket.on('disconnect', () => {
      console.log('[Boba Daemon] Frontend disconnected')
      frontendSocket = null
    })
  })

  // Start HTTP server
  httpServer.listen(WS_PORT, () => {
    console.log(`[Boba Daemon] Multi-session WebSocket server listening on port ${WS_PORT}`)
    console.log('[Boba Daemon] Ready! Waiting for session creation requests.')
    console.log('[Boba Daemon] Press Ctrl+C to stop.')
  })

  // Cleanup on exit
  process.on('SIGINT', async () => {
    console.log('\n[Boba Daemon] Shutting down...')

    // Kill all Claude processes
    for (const [sessionId, sessionInfo] of claudeSessions.entries()) {
      console.log(`[Boba Daemon] Killing Claude process for session ${sessionId}`)
      sessionInfo.process.kill('SIGTERM')
    }
    claudeSessions.clear()

    if (hookServer) {
      await hookServer.stop()
    }
    process.exit(0)
  })
}

main().catch((error) => {
  console.error('[Boba Daemon] Fatal error:', error)
  process.exit(1)
})
