import type { FastifyRequest, FastifyReply } from 'fastify'
import { authService } from '../services/auth.service'

// Extend FastifyRequest to include userId
declare module 'fastify' {
  interface FastifyRequest {
    userId?: string
  }
}

/**
 * Middleware to verify JWT token and attach userId to request
 */
export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    // Verify JWT token
    await request.jwtVerify()

    // Token payload should contain userId
    const payload = request.user as { userId: string }

    if (!payload || !payload.userId) {
      return reply.code(401).send({ error: 'Invalid token payload' })
    }

    // Verify user still exists
    const user = await authService.getUserById(payload.userId)

    if (!user) {
      return reply.code(401).send({ error: 'User not found' })
    }

    // Attach userId to request
    request.userId = payload.userId
  } catch (error) {
    return reply.code(401).send({ error: 'Unauthorized' })
  }
}
