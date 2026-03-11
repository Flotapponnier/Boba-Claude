import { FastifyRequest } from 'fastify'

export interface AuthenticatedRequest extends FastifyRequest {
  userId: string
}

export interface ClaudeOAuthTokenResponse {
  access_token: string
  refresh_token?: string
  token_type: string
  expires_in?: number
  scope?: string
}

export interface ClaudeOAuthState {
  userId: string
  redirect?: string
}
