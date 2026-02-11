import { PrismaClient } from '@prisma/client'
import { env } from '../config/env'

// Singleton Prisma Client
let prisma: PrismaClient

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined
}

if (env.isProduction) {
  prisma = new PrismaClient({
    log: ['error', 'warn'],
  })
} else {
  // In development, use a global variable to prevent multiple instances
  if (!global.__prisma) {
    global.__prisma = new PrismaClient({
      log: ['query', 'error', 'warn'],
    })
  }
  prisma = global.__prisma
}

export { prisma }

// Graceful shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect()
})
