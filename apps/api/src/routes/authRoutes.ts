import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { encryptString, decryptString } from '../utils/encryption.js'
import { AuthenticatedRequest, ClaudeOAuthState, ClaudeOAuthTokenResponse } from '../types/index.js'
import { authenticate } from '../middlewares/authenticate.js'

const CLAUDE_AUTH_URL = 'https://console.anthropic.com/oauth/authorize'
const CLAUDE_TOKEN_URL = 'https://console.anthropic.com/oauth/token'

export async function authRoutes(app: FastifyInstance) {
  // Verify JWT token (for daemon)
  app.get('/auth/verify', {
    preHandler: authenticate,
  }, async (request, reply) => {
    const { userId } = request as AuthenticatedRequest
    return { userId }
  })

  // Guest login - creates anonymous account
  app.post('/auth/guest', async (request, reply) => {
    const publicKey = nanoid()

    const account = await app.prisma.account.create({
      data: {
        publicKey,
        username: `guest_${publicKey.slice(0, 8)}`,
      },
    })

    const token = app.jwt.sign({ userId: account.id })

    return {
      token,
      account: {
        id: account.id,
        username: account.username,
        publicKey: account.publicKey,
      },
    }
  })

  // Initiate Claude OAuth flow
  app.get('/auth/claude-login', {
    preHandler: authenticate,
  }, async (request, reply) => {
    // Check if OAuth is configured
    if (!process.env.CLAUDE_CLIENT_ID) {
      return reply.status(501).send({
        error: 'OAuth not configured',
        message: 'Set CLAUDE_CLIENT_ID in .env to enable OAuth'
      })
    }

    const { userId } = request as AuthenticatedRequest

    // Generate PKCE codes
    const { randomBytes, createHash } = await import('crypto')
    const verifier = randomBytes(32).toString('base64url')
    const challenge = createHash('sha256').update(verifier).digest('base64url')

    // Create state parameter with userId + verifier
    const state: ClaudeOAuthState = { userId, verifier }
    const stateToken = app.jwt.sign(state, { expiresIn: '10m' })

    const params = new URLSearchParams({
      client_id: process.env.CLAUDE_CLIENT_ID!,
      redirect_uri: process.env.CLAUDE_REDIRECT_URI!,
      response_type: 'code',
      scope: 'user:inference',
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state: stateToken,
    })

    const authUrl = `${CLAUDE_AUTH_URL}?${params.toString()}`

    return { authUrl }
  })

  // Claude OAuth callback
  app.get('/auth/claude-callback', async (request, reply) => {
    const querySchema = z.object({
      code: z.string(),
      state: z.string(),
    })

    const { code, state } = querySchema.parse(request.query)

    // Verify and decode state
    let stateData: ClaudeOAuthState
    try {
      stateData = app.jwt.verify(state) as ClaudeOAuthState
    } catch (err) {
      return reply.status(400).send({ error: 'Invalid state parameter' })
    }

    // Exchange code for tokens with PKCE
    const tokenResponse = await fetch(CLAUDE_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        client_id: process.env.CLAUDE_CLIENT_ID!,
        redirect_uri: process.env.CLAUDE_REDIRECT_URI!,
        code_verifier: stateData.verifier,
        state: state,
      }),
    })

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text()
      console.error('[OAuth] Token exchange failed:', error)
      return reply.status(400).send({ error: 'Failed to exchange authorization code' })
    }

    const tokens: ClaudeOAuthTokenResponse = await tokenResponse.json()

    // Encrypt and store tokens
    const encryptionKey = process.env.ENCRYPTION_KEY!
    const encryptedAccessToken = encryptString(encryptionKey, tokens.access_token)
    const encryptedRefreshToken = tokens.refresh_token
      ? encryptString(encryptionKey, tokens.refresh_token)
      : null

    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000)
      : null

    // Upsert token in database
    await app.prisma.claudeToken.upsert({
      where: { accountId: stateData.userId },
      create: {
        accountId: stateData.userId,
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        expiresAt,
      },
      update: {
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        expiresAt,
      },
    })

    // Redirect back to frontend
    const redirectUrl = new URL(process.env.FRONTEND_URL!)
    redirectUrl.searchParams.set('auth', 'success')

    return reply.redirect(redirectUrl.toString())
  })

  // Check if user has Claude token
  app.get('/auth/claude-status', {
    preHandler: authenticate,
  }, async (request, reply) => {
    const { userId } = request as AuthenticatedRequest

    const token = await app.prisma.claudeToken.findUnique({
      where: { accountId: userId },
      select: {
        id: true,
        expiresAt: true,
        createdAt: true,
      },
    })

    return {
      connected: !!token,
      expiresAt: token?.expiresAt,
    }
  })

  // Disconnect Claude account
  app.delete('/auth/claude-disconnect', {
    preHandler: authenticate,
  }, async (request, reply) => {
    const { userId } = request as AuthenticatedRequest

    await app.prisma.claudeToken.delete({
      where: { accountId: userId },
    }).catch(() => {
      // Ignore if doesn't exist
    })

    return { success: true }
  })

  // Get decrypted Claude token (for daemon)
  app.get('/auth/claude-token', {
    preHandler: authenticate,
  }, async (request, reply) => {
    const { userId } = request as AuthenticatedRequest

    const tokenRecord = await app.prisma.claudeToken.findUnique({
      where: { accountId: userId },
    })

    if (!tokenRecord) {
      return reply.status(404).send({ error: 'No Claude token found' })
    }

    const encryptionKey = process.env.ENCRYPTION_KEY!
    const accessToken = decryptString(encryptionKey, tokenRecord.accessToken)

    return {
      accessToken,
      expiresAt: tokenRecord.expiresAt,
    }
  })
}
