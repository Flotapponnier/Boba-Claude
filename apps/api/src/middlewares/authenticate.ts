import { FastifyRequest, FastifyReply } from 'fastify'
import { AuthenticatedRequest } from '../types/index.js'

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const payload = await request.jwtVerify()

    if (!payload.userId || typeof payload.userId !== 'string') {
      return reply.status(401).send({ error: 'Invalid token payload' })
    }

    // Attach userId to request
    ;(request as AuthenticatedRequest).userId = payload.userId
  } catch (err) {
    return reply.status(401).send({ error: 'Unauthorized' })
  }
}
