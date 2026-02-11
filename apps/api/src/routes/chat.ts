import type { FastifyInstance } from 'fastify'

export async function chatRoutes(fastify: FastifyInstance) {
  // Get available daemon session (daemon-only mode, no server sessions)
  fastify.get('/chat/daemon-session', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    // This will be populated by the socket handler when daemon connects
    const daemonSessionId = (request.server as any).daemonSessionId
    if (!daemonSessionId) {
      return reply.code(404).send({ error: 'No daemon connected. Please start boba-daemon locally.' })
    }
    return { sessionId: daemonSessionId }
  })
}
