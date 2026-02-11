import { createServer, IncomingMessage, ServerResponse } from 'http'
import { oauthService } from '../services/oauth.service'
import { logger } from '../utils/logger'

/**
 * Temporary callback server for OAuth on port 54545
 * This matches the redirect URI registered with Claude Code CLI
 */

interface CallbackSession {
  resolve: (result: { success: boolean; error?: string }) => void
  createdAt: number
}

class CallbackServer {
  private server: ReturnType<typeof createServer> | null = null
  private pendingSessions = new Map<string, CallbackSession>()

  /**
   * Start temporary callback server and wait for OAuth redirect
   */
  async waitForCallback(state: string): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      // Store pending session
      this.pendingSessions.set(state, {
        resolve,
        createdAt: Date.now(),
      })

      // Start server if not already running
      if (!this.server) {
        this.startServer()
      }

      // Timeout after 5 minutes
      setTimeout(() => {
        const session = this.pendingSessions.get(state)
        if (session) {
          this.pendingSessions.delete(state)
          resolve({ success: false, error: 'Timeout waiting for OAuth callback' })
        }
      }, 5 * 60 * 1000)
    })
  }

  private startServer() {
    this.server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url!, 'http://localhost:54545')

      if (url.pathname === '/callback') {
        const code = url.searchParams.get('code')
        const state = url.searchParams.get('state')

        if (!code || !state) {
          res.writeHead(400, { 'Content-Type': 'text/html' })
          res.end('<h1>Invalid callback</h1><p>Missing code or state parameter</p>')
          return
        }

        // Find pending session
        const session = this.pendingSessions.get(state)
        if (!session) {
          res.writeHead(400, { 'Content-Type': 'text/html' })
          res.end('<h1>Invalid state</h1><p>Session expired or invalid</p>')
          return
        }

        try {
          // Exchange code for token
          await oauthService.handleCallback(code, state)

          // Redirect to success page
          res.writeHead(302, {
            'Location': 'https://console.anthropic.com/oauth/code/success?app=boba-claude'
          })
          res.end()

          // Resolve pending promise
          session.resolve({ success: true })
          this.pendingSessions.delete(state)

          logger.info('[OAuth] Successfully authenticated')
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error'

          res.writeHead(500, { 'Content-Type': 'text/html' })
          res.end(`<h1>Authentication failed</h1><p>${errorMessage}</p>`)

          session.resolve({ success: false, error: errorMessage })
          this.pendingSessions.delete(state)

          logger.error('[OAuth] Authentication failed:', error)
        }
      } else {
        res.writeHead(404)
        res.end('Not found')
      }
    })

    this.server.listen(54545, '127.0.0.1', () => {
      logger.info('[OAuth] Callback server listening on port 54545')
    })

    // Clean up old sessions every minute
    setInterval(() => {
      const fiveMinutesAgo = Date.now() - 5 * 60 * 1000
      for (const [state, session] of this.pendingSessions.entries()) {
        if (session.createdAt < fiveMinutesAgo) {
          session.resolve({ success: false, error: 'Session expired' })
          this.pendingSessions.delete(state)
        }
      }
    }, 60 * 1000)
  }

  stop() {
    if (this.server) {
      this.server.close()
      this.server = null
      logger.info('[OAuth] Callback server stopped')
    }
  }
}

export const callbackServer = new CallbackServer()
