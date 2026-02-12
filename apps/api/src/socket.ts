import { Server, Socket } from 'socket.io'
import { FastifyInstance } from 'fastify'
import { logger } from './utils/logger'
import { authService } from './services/auth.service'
import { z } from 'zod'

const messageSchema = z.object({
  type: z.literal('message'),
  content: z.string(),
})

export function startSocket(app: FastifyInstance) {
  const io = new Server(app.server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST', 'OPTIONS'],
      credentials: true,
      allowedHeaders: ['*'],
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 45000,
    pingInterval: 15000,
    path: '/socket.io',
    allowUpgrades: true,
    upgradeTimeout: 10000,
    connectTimeout: 20000,
    serveClient: false,
  })

  // Track daemon connections by sessionId
  const daemonSockets = new Map<string, Socket>()
  // Track frontend connections by sessionId
  const frontendSockets = new Map<string, Socket>()

  // Store current daemon sessionId for API access
  let currentDaemonSessionId: string | null = null

  io.on('connection', async (socket: Socket) => {
    logger.info(`Socket.IO connection attempt: ${socket.id}`)

    const token = socket.handshake.auth.token as string
    const sessionId = socket.handshake.auth.sessionId as string
    const clientType = socket.handshake.auth.clientType as string | undefined

    if (!token) {
      logger.warn('No token provided')
      socket.emit('error', { message: 'Missing authentication token' })
      socket.disconnect()
      return
    }

    if (!sessionId) {
      logger.warn('No sessionId provided')
      socket.emit('error', { message: 'Missing session ID' })
      socket.disconnect()
      return
    }

    // Authenticate user
    let userId: string

    if (token === 'local-session') {
      // Local-only development mode
      let localUser = await authService.getUserByEmail('local@boba.com')
      if (!localUser) {
        localUser = await authService.createUser({
          email: 'local@boba.com',
          password: 'local-dev',
          name: 'Local User',
        })
      }
      userId = localUser.id
    } else {
      // Verify JWT token
      try {
        const decoded = app.jwt.verify(token) as { userId: string }
        userId = decoded.userId
      } catch {
        logger.warn('Invalid token')
        socket.emit('error', { message: 'Invalid authentication token' })
        socket.disconnect()
        return
      }
    }

    logger.info(`Token verified for user ${userId}, sessionId: ${sessionId}, clientType: ${clientType}`)

    // If daemon connection, register it
    if (clientType === 'daemon') {
      logger.info(`Daemon connected for session ${sessionId}`)
      daemonSockets.set(sessionId, socket)
      currentDaemonSessionId = sessionId
      // Make it accessible to routes
      ;(app as any).daemonSessionId = sessionId

      // Handle daemon messages
      socket.on('claude_output', (data: any) => {
        try {
          // data.data is the JSON string from Claude
          const claudeMessage = JSON.parse(data.data)
          console.log('[Daemon] Claude message:', JSON.stringify(claudeMessage, null, 2))

          // Forward to frontend
          const frontendSocket = frontendSockets.get(sessionId)
          if (!frontendSocket) {
            console.log('[Daemon] No frontend socket for session:', sessionId)
            return
          }

          // Handle different message types
          if (claudeMessage.type === 'content_block_delta' && claudeMessage.delta?.type === 'text_delta') {
            // Streaming text chunk
            console.log('[Daemon] Sending content_delta to frontend:', claudeMessage.delta.text)
            frontendSocket.emit('claude_message', {
              delta: {
                text: claudeMessage.delta.text,
                role: 'assistant',
              },
            })
          } else if (claudeMessage.type === 'message') {
            // Full message
            const content = Array.isArray(claudeMessage.content)
              ? claudeMessage.content.map((c: any) => c.text || '').join('')
              : claudeMessage.content?.text || claudeMessage.content || ''

            console.log('[Daemon] Sending full message to frontend:', content)
            frontendSocket.emit('claude_message', {
              message: {
                type: 'text',
                text: content,
                role: 'assistant',
              },
            })
          } else if (claudeMessage.type === 'assistant') {
            // Handle assistant message type - extract text and tool uses
            const messageObj = claudeMessage.message
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
                console.log('[Daemon] Sending assistant message to frontend:', text)
                frontendSocket.emit('claude_message', {
                  message: {
                    type: 'text',
                    text,
                    role: 'assistant',
                  },
                })
              }

              // Send tool uses
              for (const toolUse of toolUses) {
                console.log('[Daemon] Tool use:', toolUse.name, toolUse.id)
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
          } else if (claudeMessage.type === 'system' || claudeMessage.type === 'result') {
            // Ignore system and result messages
            console.log('[Daemon] Ignoring message type:', claudeMessage.type)
          } else {
            console.log('[Daemon] Unhandled message type:', claudeMessage.type)
          }
        } catch (err) {
          console.error('[Daemon] Failed to parse Claude output:', err, 'Raw data:', data.data)
        }
      })

      socket.on('session_update', (data: any) => {
        logger.info(`[Daemon] Session update: ${JSON.stringify(data)}`)
        // Forward to frontend
        const frontendSocket = frontendSockets.get(sessionId)
        if (frontendSocket) {
          frontendSocket.emit('session_update', data)
        }
      })

      socket.on('disconnect', () => {
        logger.info(`Daemon disconnected for session ${sessionId}`)
        daemonSockets.delete(sessionId)
        if (currentDaemonSessionId === sessionId) {
          currentDaemonSessionId = null
          ;(app as any).daemonSessionId = null
        }
      })

      socket.emit('ready', {
        type: 'ready',
        data: { sessionId },
      })

      return
    }

    // Frontend connection - daemon-only mode, no server sessions
    const isDaemonSession = daemonSockets.has(sessionId)

    if (!isDaemonSession) {
      socket.emit('error', { message: 'Daemon session not found. Please start boba-daemon locally.' })
      socket.disconnect()
      return
    }

    // Register frontend socket
    frontendSockets.set(sessionId, socket)

    // Handle incoming messages from frontend
    socket.on('message', async (data: any) => {
      try {
        const parsed = messageSchema.parse(data)

        // Forward to daemon
        const daemonSocket = daemonSockets.get(sessionId)
        if (daemonSocket) {
          daemonSocket.emit('user_message', {
            type: 'user_message',
            content: parsed.content,
          })

          // Acknowledge message sent
          socket.emit('message_sent', {
            type: 'message_sent',
            data: { content: parsed.content },
          })
        } else {
          socket.emit('error', {
            type: 'error',
            error: 'Daemon not connected. Please start boba-daemon locally.',
          })
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        socket.emit('error', { type: 'error', error: message })
      }
    })

    // Cleanup on frontend disconnect
    socket.on('disconnect', () => {
      logger.info(`Frontend disconnected: ${socket.id}`)
      frontendSockets.delete(sessionId)
    })

    // Send ready message
    socket.emit('ready', {
      type: 'ready',
      data: {
        sessionId,
        status: 'ready',
        mode: 'daemon'
      },
    })

    logger.info(`Socket connected for user ${userId}, session ${sessionId} (daemon mode)`)
  })

  logger.info('Socket.IO initialized')
}
