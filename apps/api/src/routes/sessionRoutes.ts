import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../middlewares/authenticate.js'
import { AuthenticatedRequest } from '../types/index.js'

export async function sessionRoutes(app: FastifyInstance) {
  // Get all sessions for user
  app.get('/sessions', {
    preHandler: authenticate,
  }, async (request, reply) => {
    const { userId } = request as AuthenticatedRequest

    const sessions = await app.prisma.session.findMany({
      where: { accountId: userId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { updatedAt: 'desc' },
    })

    return { sessions }
  })

  // Create new session
  app.post('/sessions', {
    preHandler: authenticate,
  }, async (request, reply) => {
    const { userId } = request as AuthenticatedRequest
    const { title, claudeSessionId } = request.body as any

    const session = await app.prisma.session.create({
      data: {
        accountId: userId,
        title: title || 'New Chat',
        claudeSessionId,
      },
    })

    return { session }
  })

  // Update session
  app.patch('/sessions/:id', {
    preHandler: authenticate,
  }, async (request, reply) => {
    const { userId } = request as AuthenticatedRequest
    const { id } = request.params as any
    const updates = request.body as any

    // Verify ownership
    const session = await app.prisma.session.findFirst({
      where: { id, accountId: userId },
    })

    if (!session) {
      return reply.status(404).send({ error: 'Session not found' })
    }

    const updated = await app.prisma.session.update({
      where: { id },
      data: updates,
    })

    return { session: updated }
  })

  // Delete session
  app.delete('/sessions/:id', {
    preHandler: authenticate,
  }, async (request, reply) => {
    const { userId } = request as AuthenticatedRequest
    const { id } = request.params as any

    // Verify ownership
    const session = await app.prisma.session.findFirst({
      where: { id, accountId: userId },
    })

    if (!session) {
      return reply.status(404).send({ error: 'Session not found' })
    }

    await app.prisma.session.delete({
      where: { id },
    })

    return { success: true }
  })

  // Add message to session
  app.post('/sessions/:id/messages', {
    preHandler: authenticate,
  }, async (request, reply) => {
    const { userId } = request as AuthenticatedRequest
    const { id } = request.params as any
    const { role, content } = request.body as any

    // Verify ownership
    const session = await app.prisma.session.findFirst({
      where: { id, accountId: userId },
    })

    if (!session) {
      return reply.status(404).send({ error: 'Session not found' })
    }

    const message = await app.prisma.message.create({
      data: {
        sessionId: id,
        role,
        content,
      },
    })

    // Update session timestamp
    await app.prisma.session.update({
      where: { id },
      data: { updatedAt: new Date() },
    })

    return { message }
  })
}
