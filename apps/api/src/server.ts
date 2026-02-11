import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import { env } from './config/env'
import { logger } from './utils/logger'
import { errorHandler } from './middleware/error'
import { authMiddleware } from './middleware/auth'
import { healthRoutes } from './routes/health'
import { authRoutes } from './routes/auth'
import { oauthRoutes } from './routes/oauth'
import { connectRoutes } from './routes/connect'
import { devRoutes } from './routes/dev'
import { chatRoutes } from './routes/chat'
import { startSocket } from './socket'

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

  // Decorate request with authenticate method
  fastify.decorate('authenticate', authMiddleware)

  // Error handler
  fastify.setErrorHandler(errorHandler)

  // Routes
  await fastify.register(healthRoutes)
  await fastify.register(authRoutes)
  await fastify.register(oauthRoutes)
  await fastify.register(connectRoutes)
  await fastify.register(chatRoutes)
  await fastify.register(devRoutes)

  // Socket.IO after routes
  await fastify.ready()
  startSocket(fastify)

  return fastify
}

// Extend Fastify types
declare module 'fastify' {
  interface FastifyInstance {
    authenticate: typeof authMiddleware
  }
}
