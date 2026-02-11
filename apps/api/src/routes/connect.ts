import type { FastifyInstance } from 'fastify'
import { oauthService } from '../services/oauth.service'
import { callbackServer } from './callback-server'
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
 * Connect routes - OAuth flow for Claude with callback server
 */
export async function connectRoutes(fastify: FastifyInstance) {
  // Start OAuth flow (opens browser and waits for callback)
  fastify.post('/connect/claude', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    try {
      // Generate authorization URL
      const url = await oauthService.getAuthorizationUrl(request.userId!)

      // Extract state from URL for callback tracking
      const urlObj = new URL(url)
      const state = urlObj.searchParams.get('state')

      if (!state) {
        return reply.code(500).send({ error: 'Failed to generate OAuth state' })
      }

      // Open browser automatically
      await openBrowser(url)

      // Wait for OAuth callback (with 5-minute timeout)
      const result = await callbackServer.waitForCallback(state)

      if (result.success) {
        return {
          success: true,
          message: 'Successfully connected to Claude!',
        }
      } else {
        return reply.code(400).send({
          error: result.error || 'OAuth flow failed',
        })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return reply.code(500).send({ error: message })
    }
  })

  // Save API key for Claude Code CLI
  fastify.post('/connect/api-key', {
    onRequest: [fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        required: ['apiKey'],
        properties: {
          apiKey: { type: 'string', pattern: '^sk-ant-' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { apiKey } = request.body as { apiKey: string }

      // Store API key encrypted (use 'anthropic-api' to separate from OAuth token)
      const { tokenService } = await import('../services/token.service')
      await tokenService.saveToken(request.userId!, 'anthropic-api' as any, apiKey)

      return { success: true, message: 'API key saved successfully' }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return reply.code(500).send({ error: message })
    }
  })
}
