#!/usr/bin/env node
import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import { PrismaClient } from '@prisma/client'
import { authRoutes } from './routes/authRoutes.js'
import { sessionRoutes } from './routes/sessionRoutes.js'
import { workspaceRoutes } from './routes/workspaceRoutes.js'

const PORT = parseInt(process.env.PORT || '3002', 10)

// Validate required env vars (except OAuth which is optional for dev)
const requiredEnv = [
  'DATABASE_URL',
  'JWT_SECRET',
  'ENCRYPTION_KEY',
  'FRONTEND_URL',
]

const optionalEnv = [
  'CLAUDE_CLIENT_ID',
  'CLAUDE_CLIENT_SECRET',
  'CLAUDE_REDIRECT_URI',
]

for (const key of requiredEnv) {
  if (!process.env[key]) {
    console.error(`[API] Missing required environment variable: ${key}`)
    process.exit(1)
  }
}

// Warn about optional OAuth vars
const missingOAuth = optionalEnv.filter(key => !process.env[key])
if (missingOAuth.length > 0) {
  console.warn(`[API] WARNING: OAuth not configured (missing: ${missingOAuth.join(', ')})`)
  console.warn(`[API] Users will use system Claude auth instead of per-user tokens`)
}

async function main() {
  const app = Fastify({
    logger: true,
  })

  // Initialize Prisma
  const prisma = new PrismaClient()
  app.decorate('prisma', prisma)

  // Register CORS
  await app.register(cors, {
    origin: (origin, cb) => {
      // Allow localhost, FRONTEND_URL, and Vercel deployments
      if (!origin ||
          origin === process.env.FRONTEND_URL ||
          origin.includes('localhost') ||
          origin.includes('vercel.app')) {
        cb(null, true)
      } else {
        cb(new Error('Not allowed by CORS'), false)
      }
    },
    credentials: true,
  })

  // Register JWT
  await app.register(jwt, {
    secret: process.env.JWT_SECRET!,
  })

  // Health check
  app.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() }
  })

  // Register routes
  await app.register(authRoutes, { prefix: '/api' })
  await app.register(sessionRoutes, { prefix: '/api' })
  await app.register(workspaceRoutes, { prefix: '/api' })

  // Start server
  try {
    await app.listen({ port: PORT, host: '0.0.0.0' })
    console.log(`[API] Server listening on http://0.0.0.0:${PORT}`)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\n[API] Shutting down...')
    await prisma.$disconnect()
    await app.close()
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((err) => {
  console.error('[API] Fatal error:', err)
  process.exit(1)
})

// Type augmentation for Fastify
declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient
  }
}
