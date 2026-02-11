import type { FastifyInstance } from 'fastify'
import { oauthService } from '../services/oauth.service'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

/**
 * Open URL in default browser
 */
async function openBrowser(url: string): Promise<void> {
  const command = process.platform === 'darwin'
    ? `open "${url}"`
    : process.platform === 'win32'
    ? `start "${url}"`
    : `xdg-open "${url}"`

  try {
    await execAsync(command)
  } catch (error) {
    console.error('Failed to open browser:', error)
  }
}

/**
 * Connect routes - simplified OAuth flow for Claude
 */
export async function connectRoutes(fastify: FastifyInstance) {
  // Start OAuth flow (opens browser)
  fastify.post('/connect/claude', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    try {
      // Generate authorization URL
      const url = await oauthService.getAuthorizationUrl(request.userId!)

      // Open browser automatically
      await openBrowser(url)

      return {
        success: true,
        url,
        message: 'Browser opened. Please authorize Claude access.',
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return reply.code(500).send({ error: message })
    }
  })
}
