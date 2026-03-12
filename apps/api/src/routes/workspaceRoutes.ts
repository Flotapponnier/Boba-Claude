import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../middlewares/authenticate.js'
import { AuthenticatedRequest } from '../types/index.js'
import { encryptString, decryptString } from '../utils/encryption.js'

export async function workspaceRoutes(app: FastifyInstance) {
  // Get all workspaces for user
  app.get('/workspaces', {
    preHandler: authenticate,
  }, async (request, reply) => {
    const { userId } = request as AuthenticatedRequest

    const workspaces = await app.prisma.workspace.findMany({
      where: { accountId: userId },
      orderBy: { createdAt: 'desc' },
    })

    // Decrypt passwords before returning
    const decryptedWorkspaces = workspaces.map((ws) => ({
      ...ws,
      sshPassword: ws.sshPassword ? '********' : null, // Don't expose passwords
    }))

    return { workspaces: decryptedWorkspaces }
  })

  // Get active workspace for user
  app.get('/workspaces/:userId/active', async (request, reply) => {
    const paramsSchema = z.object({
      userId: z.string(),
    })

    const { userId } = paramsSchema.parse(request.params)

    const workspace = await app.prisma.workspace.findFirst({
      where: {
        accountId: userId,
        isActive: true,
      },
    })

    if (!workspace) {
      return reply.status(404).send({ error: 'No active workspace found' })
    }

    // Decrypt password
    const encryptionKey = process.env.ENCRYPTION_KEY!
    const decryptedWorkspace = {
      ...workspace,
      sshPassword: workspace.sshPassword
        ? decryptString(encryptionKey, workspace.sshPassword)
        : null,
    }

    return decryptedWorkspace
  })

  // Create workspace
  app.post('/workspaces', {
    preHandler: authenticate,
  }, async (request, reply) => {
    const { userId } = request as AuthenticatedRequest

    const bodySchema = z.object({
      name: z.string(),
      sshHost: z.string(),
      sshPort: z.number().default(22),
      sshUser: z.string(),
      sshPassword: z.string().optional(),
      workingDir: z.string().default('/home/rescue'),
      isActive: z.boolean().default(true),
    })

    const data = bodySchema.parse(request.body)

    // If isActive is true, deactivate all other workspaces
    if (data.isActive) {
      await app.prisma.workspace.updateMany({
        where: { accountId: userId },
        data: { isActive: false },
      })
    }

    // Encrypt password if provided
    const encryptionKey = process.env.ENCRYPTION_KEY!
    const encryptedPassword = data.sshPassword
      ? encryptString(encryptionKey, data.sshPassword)
      : null

    const workspace = await app.prisma.workspace.create({
      data: {
        accountId: userId,
        name: data.name,
        sshHost: data.sshHost,
        sshPort: data.sshPort,
        sshUser: data.sshUser,
        sshPassword: encryptedPassword,
        workingDir: data.workingDir,
        isActive: data.isActive,
      },
    })

    return {
      workspace: {
        ...workspace,
        sshPassword: workspace.sshPassword ? '********' : null,
      },
    }
  })

  // Update workspace
  app.patch('/workspaces/:workspaceId', {
    preHandler: authenticate,
  }, async (request, reply) => {
    const { userId } = request as AuthenticatedRequest

    const paramsSchema = z.object({
      workspaceId: z.string(),
    })

    const bodySchema = z.object({
      name: z.string().optional(),
      sshHost: z.string().optional(),
      sshPort: z.number().optional(),
      sshUser: z.string().optional(),
      sshPassword: z.string().optional(),
      workingDir: z.string().optional(),
      isActive: z.boolean().optional(),
    })

    const { workspaceId } = paramsSchema.parse(request.params)
    const data = bodySchema.parse(request.body)

    // Verify ownership
    const workspace = await app.prisma.workspace.findUnique({
      where: { id: workspaceId },
    })

    if (!workspace || workspace.accountId !== userId) {
      return reply.status(404).send({ error: 'Workspace not found' })
    }

    // If isActive is being set to true, deactivate all other workspaces
    if (data.isActive) {
      await app.prisma.workspace.updateMany({
        where: {
          accountId: userId,
          id: { not: workspaceId },
        },
        data: { isActive: false },
      })
    }

    // Encrypt password if provided
    const encryptionKey = process.env.ENCRYPTION_KEY!
    const updateData: any = { ...data }
    if (data.sshPassword) {
      updateData.sshPassword = encryptString(encryptionKey, data.sshPassword)
    }

    const updated = await app.prisma.workspace.update({
      where: { id: workspaceId },
      data: updateData,
    })

    return {
      workspace: {
        ...updated,
        sshPassword: updated.sshPassword ? '********' : null,
      },
    }
  })

  // Delete workspace
  app.delete('/workspaces/:workspaceId', {
    preHandler: authenticate,
  }, async (request, reply) => {
    const { userId } = request as AuthenticatedRequest

    const paramsSchema = z.object({
      workspaceId: z.string(),
    })

    const { workspaceId } = paramsSchema.parse(request.params)

    // Verify ownership
    const workspace = await app.prisma.workspace.findUnique({
      where: { id: workspaceId },
    })

    if (!workspace || workspace.accountId !== userId) {
      return reply.status(404).send({ error: 'Workspace not found' })
    }

    await app.prisma.workspace.delete({
      where: { id: workspaceId },
    })

    return { success: true }
  })

  // Set active workspace
  app.post('/workspaces/:workspaceId/activate', {
    preHandler: authenticate,
  }, async (request, reply) => {
    const { userId } = request as AuthenticatedRequest

    const paramsSchema = z.object({
      workspaceId: z.string(),
    })

    const { workspaceId } = paramsSchema.parse(request.params)

    // Verify ownership
    const workspace = await app.prisma.workspace.findUnique({
      where: { id: workspaceId },
    })

    if (!workspace || workspace.accountId !== userId) {
      return reply.status(404).send({ error: 'Workspace not found' })
    }

    // Deactivate all workspaces
    await app.prisma.workspace.updateMany({
      where: { accountId: userId },
      data: { isActive: false },
    })

    // Activate this one
    await app.prisma.workspace.update({
      where: { id: workspaceId },
      data: { isActive: true },
    })

    return { success: true }
  })
}
