import type { FastifyRequest, FastifyReply } from 'fastify'
import { authService } from '../services/auth.service'

// Extend FastifyRequest to include userId
declare module 'fastify' {
  interface FastifyRequest {
    userId?: string
  }
}

// Local user for development/local-only mode
let localUser: { id: string } | null = null

const getOrCreateLocalUser = async () => {
  if (localUser) return localUser

  // Try to get existing local user
  const existingUser = await authService.getUserByEmail('local@boba.com')
  if (existingUser) {
    localUser = existingUser
    return existingUser
  }

  // Create local user
  const user = await authService.createUser({
    email: 'local@boba.com',
    password: 'local-dev',
    name: 'Local User',
  })

  localUser = user
  return user
}

/**
 * Middleware to verify JWT token and attach userId to request
 * For local development, accepts 'Bearer local-session' token
 */
export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    // Check for local-session bypass token (for local-only mode)
    const authHeader = request.headers.authorization
    if (authHeader === 'Bearer local-session') {
      const user = await getOrCreateLocalUser()
      request.userId = user.id
      return
    }

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
