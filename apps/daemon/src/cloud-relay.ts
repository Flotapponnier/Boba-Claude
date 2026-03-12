#!/usr/bin/env node
import { Server as SocketServer } from 'socket.io'
import { createServer } from 'node:http'

const WS_PORT = 3001
const API_URL = process.env.API_URL || 'http://localhost:3002'

// Machine registry: userId -> socket connection from local daemon
const machineRegistry = new Map<string, any>()

// Frontend connections: socket -> userId
const frontendConnections = new Map<any, string>()

async function main() {
  console.log('[Boba Cloud Relay] Starting relay server...')

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

  // Handle connections
  io.on('connection', async (socket) => {
    const authToken = socket.handshake.auth?.token
    const clientType = socket.handshake.auth?.clientType // 'daemon' or 'frontend'

    if (!authToken) {
      console.error('[Cloud Relay] No auth token provided')
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
      console.log(`[Cloud Relay] Authenticated user: ${userId} (type: ${clientType})`)
    } catch (error) {
      console.error('[Cloud Relay] Authentication failed:', error)
      socket.emit('error', { error: 'Invalid authentication token' })
      socket.disconnect()
      return
    }

    // Handle daemon connections
    if (clientType === 'daemon') {
      console.log(`[Cloud Relay] Daemon connected for user ${userId}`)
      machineRegistry.set(userId, socket)

      // Forward all daemon events to user's frontends
      socket.on('session_ready', (data: any) => {
        console.log(`[Cloud Relay] Forwarding session_ready to frontends for user ${userId}`)
        broadcastToUserFrontends(userId, 'session_ready', data)
      })

      socket.on('session_ended', (data: any) => {
        broadcastToUserFrontends(userId, 'session_ended', data)
      })

      socket.on('session_cancelled', (data: any) => {
        broadcastToUserFrontends(userId, 'session_cancelled', data)
      })

      socket.on('session_history', (data: any) => {
        broadcastToUserFrontends(userId, 'session_history', data)
      })

      socket.on('claude_message', (data: any) => {
        console.log(`[Cloud Relay] Forwarding claude_message to frontends for user ${userId}`)
        broadcastToUserFrontends(userId, 'output', data)
      })

      socket.on('disconnect', () => {
        console.log(`[Cloud Relay] Daemon disconnected for user ${userId}`)
        machineRegistry.delete(userId)
      })

      return
    }

    // Helper function to broadcast to all frontends for a user
    function broadcastToUserFrontends(targetUserId: string, event: string, data: any) {
      for (const [frontendSocket, frontendUserId] of frontendConnections.entries()) {
        if (frontendUserId === targetUserId && frontendSocket.connected) {
          frontendSocket.emit(event, data)
        }
      }
    }

    // Handle frontend connections
    console.log(`[Cloud Relay] Frontend connected for user ${userId}`)
    frontendConnections.set(socket, userId)

    // Get user's daemon socket
    const daemonSocket = machineRegistry.get(userId)
    if (!daemonSocket) {
      console.error(`[Cloud Relay] No daemon connected for user ${userId}`)
      socket.emit('error', { error: 'No local daemon connected. Run "boba start" on your machine.' })
    }

    // Forward create_session to daemon
    socket.on('create_session', (data: { sessionId: string; resumeFrom?: string }) => {
      console.log(`[Cloud Relay] Forwarding create_session to daemon for user ${userId}`)
      const daemon = machineRegistry.get(userId)
      if (!daemon) {
        socket.emit('error', { error: 'No daemon connected' })
        return
      }
      daemon.emit('spawn_session', {
        sessionId: data.sessionId,
        directory: process.env.DEFAULT_WORKSPACE_DIR || '/tmp/boba-sessions'
      }, (response: any) => {
        if (response.success) {
          socket.emit('session_ready', { sessionId: data.sessionId })
        } else {
          socket.emit('error', { error: response.error })
        }
      })
    })

    // Forward delete_session to daemon
    socket.on('delete_session', (data: { sessionId: string }) => {
      console.log(`[Cloud Relay] Forwarding delete_session to daemon`)
      const daemon = machineRegistry.get(userId)
      if (!daemon) return
      daemon.emit('stop_session', { sessionId: data.sessionId }, (response: any) => {
        console.log(`[Cloud Relay] Session stopped:`, response)
      })
    })

    // Forward messages to daemon
    socket.on('message', (data: { sessionId: string; content: string }) => {
      const daemon = machineRegistry.get(userId)
      if (!daemon) {
        socket.emit('error', { error: 'No daemon connected' })
        return
      }
      daemon.emit('user_message', data)
    })

    // Listen for daemon messages and forward to all frontends for this user
    // This is handled globally below, not per frontend connection

    socket.on('disconnect', () => {
      console.log(`[Cloud Relay] Frontend disconnected for user ${userId}`)
      frontendConnections.delete(socket)
    })
  })

  httpServer.listen(WS_PORT, () => {
    console.log(`[Cloud Relay] Relay server listening on port ${WS_PORT}`)
    console.log('[Cloud Relay] Ready to relay between frontends and local daemons')
  })

  process.on('SIGINT', () => {
    console.log('\n[Cloud Relay] Shutting down...')
    process.exit(0)
  })
}

main().catch((error) => {
  console.error('[Cloud Relay] Fatal error:', error)
  process.exit(1)
})
