import type { FastifyInstance } from 'fastify'
import { claudeService } from '../services/claude.service'
import { z } from 'zod'

const messageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
})

const chatRequestSchema = z.object({
  messages: z.array(messageSchema),
  model: z.string().optional(),
})

export async function chatRoutes(fastify: FastifyInstance) {
  // Send message (non-streaming)
  fastify.post('/chat/send', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const body = chatRequestSchema.parse(request.body)

    try {
      const response = await claudeService.sendMessage(request.userId!, body)
      return response
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'

      if (message.includes('No Claude API token')) {
        return reply.code(401).send({ error: message })
      }

      return reply.code(500).send({ error: message })
    }
  })

  // Stream message (WebSocket)
  fastify.get('/chat/stream', {
    websocket: true,
  }, (socket, request) => {
    socket.on('message', async (data: Buffer) => {
      try {
        // Parse incoming message
        const payload = JSON.parse(data.toString())
        const parsed = chatRequestSchema.parse(payload)

        // Extract userId from JWT (we need to verify it manually for WebSocket)
        const token = request.headers.authorization?.replace('Bearer ', '')
        if (!token) {
          socket.send(JSON.stringify({ error: 'No authorization token' }))
          socket.close()
          return
        }

        try {
          const decoded = fastify.jwt.verify(token) as { userId: string }

          // Stream response
          const stream = claudeService.streamMessage(decoded.userId, parsed)

          for await (const chunk of stream) {
            socket.send(JSON.stringify({ type: 'chunk', data: chunk }))
          }

          // Send completion message
          socket.send(JSON.stringify({ type: 'done' }))
        } catch (jwtError) {
          socket.send(JSON.stringify({ error: 'Invalid token' }))
          socket.close()
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        socket.send(JSON.stringify({ type: 'error', error: message }))
      }
    })
  })
}
