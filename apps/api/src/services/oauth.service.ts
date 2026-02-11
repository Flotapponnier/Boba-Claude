import { generatePKCE, generateState } from '../utils/crypto'
import { tokenService } from './token.service'
import { env } from '../config/env'

interface PKCESession {
  verifier: string
  challenge: string
  state: string
  userId: string
  createdAt: number
}

// Claude OAuth Configuration
// Note: Using official Claude Code CLI port (54545) for OAuth callback
const CLAUDE_CONFIG = {
  CLIENT_ID: env.CLAUDE_CLIENT_ID,
  AUTHORIZE_URL: 'https://claude.ai/oauth/authorize',
  TOKEN_URL: 'https://console.anthropic.com/v1/oauth/token',
  SCOPE: 'user:inference',
  CALLBACK_URL: 'http://localhost:54545/callback',
}

export class OAuthService {
  // In-memory storage for PKCE sessions (expires after 5 minutes)
  private pkceSessions = new Map<string, PKCESession>()

  /**
   * Generate authorization URL for Claude OAuth
   */
  async getAuthorizationUrl(userId: string): Promise<string> {
    const { verifier, challenge } = generatePKCE()
    const state = generateState()

    // Store session
    this.pkceSessions.set(state, {
      verifier,
      challenge,
      state,
      userId,
      createdAt: Date.now(),
    })

    // Clean up old sessions (older than 5 minutes)
    this.cleanupOldSessions()

    // Build authorization URL with code=true for Claude.ai
    const params = new URLSearchParams({
      code: 'true', // Shows code AND redirects
      client_id: CLAUDE_CONFIG.CLIENT_ID,
      response_type: 'code',
      redirect_uri: CLAUDE_CONFIG.CALLBACK_URL,
      scope: CLAUDE_CONFIG.SCOPE,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state: state,
    })

    return `${CLAUDE_CONFIG.AUTHORIZE_URL}?${params.toString()}`
  }

  /**
   * Handle OAuth callback and exchange code for tokens
   */
  async handleCallback(
    code: string,
    state: string
  ): Promise<{ userId: string; success: boolean }> {
    // Verify state and get session
    const session = this.pkceSessions.get(state)

    if (!session) {
      throw new Error('Invalid or expired state')
    }

    // Verify state hasn't expired (5 minutes)
    if (Date.now() - session.createdAt > 5 * 60 * 1000) {
      this.pkceSessions.delete(state)
      throw new Error('State expired')
    }

    // Exchange code for tokens
    const tokenResponse = await fetch(CLAUDE_CONFIG.TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: CLAUDE_CONFIG.CALLBACK_URL,
        client_id: CLAUDE_CONFIG.CLIENT_ID,
        code_verifier: session.verifier,
        state: state,
      }),
    })

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      throw new Error(`Token exchange failed: ${tokenResponse.statusText} - ${errorText}`)
    }

    const tokenData = await tokenResponse.json() as {
      token_type: string
      access_token: string
      expires_in: number
      refresh_token?: string
      scope: string
      organization?: { uuid: string; name: string }
      account?: { uuid: string; email_address: string }
    }

    // Store encrypted token
    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000)
    await tokenService.saveToken(
      session.userId,
      'anthropic',
      tokenData.access_token,
      expiresAt
    )

    // Clean up session
    this.pkceSessions.delete(state)

    return {
      userId: session.userId,
      success: true,
    }
  }

  /**
   * Clean up sessions older than 5 minutes
   */
  private cleanupOldSessions() {
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000
    for (const [state, session] of this.pkceSessions.entries()) {
      if (session.createdAt < fiveMinutesAgo) {
        this.pkceSessions.delete(state)
      }
    }
  }
}

export const oauthService = new OAuthService()
