import type { FastifyInstance } from 'fastify'
import { oauthService } from '../services/oauth.service'
import { tokenService } from '../services/token.service'
import { z } from 'zod'
import { env } from '../config/env'

const callbackSchema = z.object({
  code: z.string(),
  state: z.string(),
})

export async function oauthRoutes(fastify: FastifyInstance) {
  // Get authorization URL (protected endpoint)
  fastify.get('/oauth/authorize', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    try {
      const url = await oauthService.getAuthorizationUrl(request.userId!)
      return { url }
    } catch (error) {
      return reply.code(500).send({
        error: 'Failed to generate authorization URL',
      })
    }
  })

  // Note: OAuth callback is now handled by a separate server on port 54545
  // (see callback-server.ts) to match Claude Code CLI's registered redirect URI

  // Check if user has valid Claude token
  fastify.get('/oauth/status', {
    onRequest: [fastify.authenticate],
  }, async (request) => {
    const hasToken = await tokenService.hasValidToken(
      request.userId!,
      'anthropic'
    )
    return { connected: hasToken }
  })

  // Disconnect Claude (delete token)
  fastify.delete('/oauth/disconnect', {
    onRequest: [fastify.authenticate],
  }, async (request) => {
    await tokenService.deleteToken(request.userId!, 'anthropic')
    return { success: true }
  })
}
