import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import websocket from '@fastify/websocket'
import { env } from './config/env'
import { logger } from './utils/logger'
import { errorHandler } from './middleware/error'
import { authMiddleware } from './middleware/auth'
import { healthRoutes } from './routes/health'
import { authRoutes } from './routes/auth'
import { oauthRoutes } from './routes/oauth'
import { devRoutes } from './routes/dev'
import { chatRoutes } from './routes/chat'

export async function buildServer() {
  const fastify = Fastify({
    logger: logger,
  })

  // CORS
  await fastify.register(cors, {
    origin: env.FRONTEND_URL,
    credentials: true,
  })

  // JWT
  await fastify.register(jwt, {
    secret: env.JWT_SECRET,
  })

  // WebSocket
  await fastify.register(websocket)

  // Decorate request with authenticate method
  fastify.decorate('authenticate', authMiddleware)

  // Error handler
  fastify.setErrorHandler(errorHandler)

  // Routes
  await fastify.register(healthRoutes)
  await fastify.register(authRoutes)
  await fastify.register(oauthRoutes)
  await fastify.register(chatRoutes)
  await fastify.register(devRoutes)

  return fastify
}

// Extend Fastify types
declare module 'fastify' {
  interface FastifyInstance {
    authenticate: typeof authMiddleware
  }
}
