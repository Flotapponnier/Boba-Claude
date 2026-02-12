#!/usr/bin/env node
import { Server } from 'socket.io'
import { createServer } from 'node:http'
import { spawnClaude } from './claude-spawner.js'
import { ChildProcess } from 'node:child_process'
import { HookServer } from './hook-server.js'

const WS_PORT = 3001
const HOOK_PORT = 3002

let claudeProcess: ChildProcess | null = null
let currentSessionId: string | null = null
let hookServer: HookServer | null = null
let frontendSocket: any = null
let pendingTools = new Map<string, { resolve: (allowed: boolean) => void; toolUse: any }>()

async function main() {
  console.log('[Boba Daemon] Starting...')

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

  // Spawn Claude in SDK mode
  console.log('[Boba Daemon] Spawning Claude CLI...')
  claudeProcess = spawnClaude({
    hookPort: HOOK_PORT,
    onOutput: async (data) => {
      // Parse JSON lines from Claude
      const lines = data.split('\n').filter(line => line.trim())
      for (const line of lines) {
        try {
          const message = JSON.parse(line)

          // Extract session ID from system/init message
          if (message.type === 'system' && message.subtype === 'init' && message.session_id) {
            if (!currentSessionId) {
              currentSessionId = message.session_id
              console.log(`[Boba Daemon] Got session ID: ${currentSessionId}`)
            }
          }

          // Forward messages to frontend
          if (frontendSocket && currentSessionId) {
            if (message.type === 'assistant') {
              // Handle assistant message type - extract text and tool uses
              const messageObj = message.message
              if (messageObj && Array.isArray(messageObj.content)) {
                // Extract text
                const text = messageObj.content
                  .filter((c: any) => c.type === 'text')
                  .map((c: any) => c.text)
                  .join('')

                // Extract tool uses
                const toolUses = messageObj.content
                  .filter((c: any) => c.type === 'tool_use')

                // Send text if present
                if (text) {
                  frontendSocket.emit('claude_message', {
                    message: {
                      type: 'text',
                      text,
                      role: 'assistant',
                    },
                  })
                }

                // Send tool uses (permissions already handled by hooks)
                for (const toolUse of toolUses) {
                  console.log(`[Boba Daemon] Tool executed: ${toolUse.name}`)
                  frontendSocket.emit('claude_message', {
                    tool: {
                      type: 'tool_use',
                      id: toolUse.id,
                      name: toolUse.name,
                      input: toolUse.input,
                    },
                  })
                }
              }
            } else if (message.type === 'system' || message.type === 'result') {
              // Ignore system and result messages
            }
          }
        } catch (e) {
          // Not JSON, log it
          console.log('[Claude]', data)
        }
      }
    },
    onExit: (code) => {
      console.log(`[Boba Daemon] Claude exited with code ${code}`)
      process.exit(code || 0)
    },
  })

  // Handle frontend connections
  io.on('connection', (socket) => {
    console.log('[Boba Daemon] Frontend connected')
    frontendSocket = socket

    // Connect hook server to frontend socket for permissions
    if (hookServer) {
      hookServer.setSocket(socket)
    }

    // Send ready with session ID
    if (currentSessionId) {
      socket.emit('ready', {
        type: 'ready',
        sessionId: currentSessionId,
      })
    }

    // Handle messages from frontend
    socket.on('message', (data: any) => {
      console.log('[Boba Daemon] Received user message:', data.content)
      if (claudeProcess && claudeProcess.stdin) {
        const message = JSON.stringify({
          type: 'user',
          message: {
            role: 'user',
            content: data.content
          }
        })
        claudeProcess.stdin.write(message + '\n')
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
    console.log(`[Boba Daemon] WebSocket server listening on port ${WS_PORT}`)
    console.log('[Boba Daemon] Ready! Claude is running.')
    console.log('[Boba Daemon] Press Ctrl+C to stop.')
  })

  // Cleanup on exit
  process.on('SIGINT', async () => {
    console.log('\n[Boba Daemon] Shutting down...')
    if (claudeProcess) {
      claudeProcess.kill('SIGTERM')
    }
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
