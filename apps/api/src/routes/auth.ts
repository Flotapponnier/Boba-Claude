import type { FastifyInstance } from 'fastify'
import { authService } from '../services/auth.service'
import { z } from 'zod'

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().optional(),
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
})

export async function authRoutes(fastify: FastifyInstance) {
  // Register
  fastify.post('/auth/register', async (request, reply) => {
    const body = registerSchema.parse(request.body)

    try {
      const user = await authService.createUser(body)

      const token = fastify.jwt.sign(
        { userId: user.id },
        { expiresIn: '7d' }
      )

      return reply.code(201).send({
        user,
        token,
      })
    } catch (error) {
      if (error instanceof Error && error.message.includes('already exists')) {
        return reply.code(409).send({
          error: 'User with this email already exists',
        })
      }
      throw error
    }
  })

  // Login
  fastify.post('/auth/login', async (request, reply) => {
    const body = loginSchema.parse(request.body)

    const user = await authService.authenticateUser(body.email, body.password)

    if (!user) {
      return reply.code(401).send({
        error: 'Invalid credentials',
      })
    }

    const token = fastify.jwt.sign(
      { userId: user.id },
      { expiresIn: '7d' }
    )

    return {
      user,
      token,
    }
  })

  // Get current user (protected)
  fastify.get('/auth/me', {
    onRequest: [fastify.authenticate],
  }, async (request) => {
    const user = await authService.getUserById(request.userId!)
    return { user }
  })
}
