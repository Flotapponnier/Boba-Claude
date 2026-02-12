#!/usr/bin/env node
import { io, Socket } from 'socket.io-client'
import { spawnClaude } from './claude-spawner.js'
import { ChildProcess } from 'node:child_process'
import { createInterface } from 'node:readline'

const SERVER_URL = process.env.BOBA_SERVER_URL || 'http://localhost:4000'
const LOCAL_TOKEN = 'local-session'

let socket: Socket | null = null
let claudeProcess: ChildProcess | null = null
let currentSessionId: string | null = null

async function main() {
  console.log('[Boba Daemon] Starting...')
  console.log(`[Boba Daemon] Server: ${SERVER_URL}`)

  // Spawn Claude in SDK mode
  console.log('[Boba Daemon] Spawning Claude CLI...')
  claudeProcess = spawnClaude({
    onOutput: (data) => {
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
              connectToServer(currentSessionId)
            }
          }

          // Forward all messages to server
          if (socket && socket.connected && currentSessionId) {
            socket.emit('claude_output', {
              type: 'claude_output',
              sessionId: currentSessionId,
              data: line,
            })
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

  function connectToServer(sessionId: string) {
    console.log(`[Boba Daemon] Connecting to server with session ID: ${sessionId}`)
    socket = io(SERVER_URL, {
      auth: {
        token: LOCAL_TOKEN,
        sessionId: sessionId,
        clientType: 'daemon',
      },
      transports: ['websocket', 'polling'],
    })

    socket.on('connect', () => {
      console.log(`[Boba Daemon] Connected with session ${sessionId}`)
    })

    socket.on('disconnect', () => {
      console.log('[Boba Daemon] Disconnected from Boba server')
    })

    socket.on('error', (error) => {
      console.error('[Boba Daemon] Socket error:', error)
    })

    // Receive messages from server to send to Claude (SDK JSON format)
    socket.on('user_message', (data: any) => {
      console.log('[Boba Daemon] Received user message:', data.content)
      if (claudeProcess && claudeProcess.stdin) {
        // Send as JSON line (Claude SDK format)
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
  }

  console.log('[Boba Daemon] Waiting for Claude to start...')

  // Cleanup on exit
  process.on('SIGINT', () => {
    console.log('\n[Boba Daemon] Shutting down...')
    if (claudeProcess) {
      claudeProcess.kill('SIGTERM')
    }
    if (socket) {
      socket.disconnect()
    }
    process.exit(0)
  })

  console.log('[Boba Daemon] Ready! Claude is running.')
  console.log('[Boba Daemon] Press Ctrl+C to stop.')
}

main().catch((error) => {
  console.error('[Boba Daemon] Fatal error:', error)
  process.exit(1)
})
