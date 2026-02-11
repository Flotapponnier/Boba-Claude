import type { FastifyInstance } from 'fastify'
import { claudeSessionManager } from '../services/claude-session.service'
import { scannerManager } from '../services/jsonl-scanner.service'
import { z } from 'zod'
import type { SocketStream } from '@fastify/websocket'

const sessionRequestSchema = z.object({
  sessionId: z.string().uuid().optional(), // Resume existing session or create new
})

const messageSchema = z.object({
  type: z.literal('message'),
  content: z.string(),
})

export async function chatRoutes(fastify: FastifyInstance) {
  // Create or resume session
  fastify.post('/chat/session', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    try {
      const body = sessionRequestSchema.parse(request.body)

      if (body.sessionId) {
        // Resume existing session
        const session = claudeSessionManager.getSession(body.sessionId)
        if (!session) {
          return reply.code(404).send({ error: 'Session not found' })
        }
        if (session.userId !== request.userId) {
          return reply.code(403).send({ error: 'Access denied' })
        }
        return { sessionId: body.sessionId, status: session.status }
      } else {
        // Create new session
        const sessionId = await claudeSessionManager.createSession(request.userId!)
        return { sessionId, status: 'ready' }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'

      if (message.includes('No API key')) {
        return reply.code(401).send({ error: 'Please save your Claude API key first' })
      }

      return reply.code(500).send({ error: message })
    }
  })

  // Get session info
  fastify.get('/chat/session/:sessionId', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string }

    const session = claudeSessionManager.getSession(sessionId)
    if (!session) {
      return reply.code(404).send({ error: 'Session not found' })
    }

    if (session.userId !== request.userId) {
      return reply.code(403).send({ error: 'Access denied' })
    }

    return session
  })

  // List user sessions
  fastify.get('/chat/sessions', {
    onRequest: [fastify.authenticate],
  }, async (request) => {
    const sessions = claudeSessionManager.getUserSessions(request.userId!)
    return { sessions }
  })

  // WebSocket stream for real-time chat
  fastify.register(async (fastify) => {
    fastify.get('/chat/stream/:sessionId', {
      websocket: true,
    }, (socket: SocketStream, request) => {
      const { sessionId } = request.params as { sessionId: string }
      let userId: string | null = null

      // Verify JWT
      const token = request.headers.authorization?.replace('Bearer ', '')
      if (!token) {
        socket.socket.send(JSON.stringify({ type: 'error', error: 'No authorization token' }))
        socket.socket.close()
        return
      }

      try {
        const decoded = fastify.jwt.verify(token) as { userId: string }
        userId = decoded.userId
      } catch {
        socket.socket.send(JSON.stringify({ type: 'error', error: 'Invalid token' }))
        socket.socket.close()
        return
      }

      // Verify session access
      const session = claudeSessionManager.getSession(sessionId)
      if (!session) {
        socket.socket.send(JSON.stringify({ type: 'error', error: 'Session not found' }))
        socket.socket.close()
        return
      }

      if (session.userId !== userId) {
        socket.socket.send(JSON.stringify({ type: 'error', error: 'Access denied' }))
        socket.socket.close()
        return
      }

      // Create JSONL scanner for this session
      const scanner = scannerManager.createScanner(sessionId)

      // Forward scanner messages to WebSocket
      scanner.on('message', (message) => {
        socket.socket.send(JSON.stringify({
          type: 'claude_message',
          data: message,
        }))
      })

      scanner.on('error', (error) => {
        socket.socket.send(JSON.stringify({
          type: 'error',
          error: error.message,
        }))
      })

      // Forward session manager events
      const handleSessionUpdate = (sid: string, state: any) => {
        if (sid === sessionId) {
          socket.socket.send(JSON.stringify({
            type: 'session_update',
            data: state,
          }))
        }
      }

      const handleThinking = (sid: string, isThinking: boolean) => {
        if (sid === sessionId) {
          socket.socket.send(JSON.stringify({
            type: 'thinking',
            data: { isThinking },
          }))
        }
      }

      claudeSessionManager.on('session:update', handleSessionUpdate)
      claudeSessionManager.on('session:thinking', handleThinking)

      // Handle incoming messages from client
      socket.socket.on('message', async (data: Buffer) => {
        try {
          const payload = JSON.parse(data.toString())
          const parsed = messageSchema.parse(payload)

          // Send message to Claude
          await claudeSessionManager.sendMessage(sessionId, parsed.content)

          // Acknowledge message sent
          socket.socket.send(JSON.stringify({
            type: 'message_sent',
            data: { content: parsed.content },
          }))
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error'
          socket.socket.send(JSON.stringify({ type: 'error', error: message }))
        }
      })

      // Cleanup on disconnect
      socket.socket.on('close', () => {
        scanner.stop()
        scannerManager.stopScanner(sessionId)
        claudeSessionManager.off('session:update', handleSessionUpdate)
        claudeSessionManager.off('session:thinking', handleThinking)
      })

      // Send ready message
      socket.socket.send(JSON.stringify({
        type: 'ready',
        data: { sessionId, status: session.status },
      }))
    })
  })

  // Stop session
  fastify.delete('/chat/session/:sessionId', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string }

    const session = claudeSessionManager.getSession(sessionId)
    if (!session) {
      return reply.code(404).send({ error: 'Session not found' })
    }

    if (session.userId !== request.userId) {
      return reply.code(403).send({ error: 'Access denied' })
    }

    await claudeSessionManager.stopSession(sessionId)
    scannerManager.stopScanner(sessionId)

    return { success: true }
  })
}
