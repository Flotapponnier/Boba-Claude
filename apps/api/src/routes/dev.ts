import type { FastifyInstance } from 'fastify'
import { tokenService } from '../services/token.service'
import { z } from 'zod'
import { env } from '../config/env'

const saveTokenSchema = z.object({
  token: z.string(),
})

/**
 * Dev routes - only available in development
 * Allows manual token injection for testing
 */
export async function devRoutes(fastify: FastifyInstance) {
  if (env.isProduction) {
    return // Skip dev routes in production
  }

  // Manually save a Claude token for testing
  fastify.post('/dev/save-token', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const body = saveTokenSchema.parse(request.body)

    await tokenService.saveToken(
      request.userId!,
      'anthropic',
      body.token,
      // Token expires in 90 days (typical for Anthropic)
      new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
    )

    return { success: true, message: 'Token saved successfully' }
  })
}
