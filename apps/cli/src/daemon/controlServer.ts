import Fastify from 'fastify'

interface ControlServerOptions {
  onSpawnSession: (directory: string, sessionId: string) => Promise<{ sessionId: string }>
  onStopSession: (sessionId: string) => Promise<boolean>
}

export async function startControlServer(options: ControlServerOptions) {
  const app = Fastify({ logger: false })

  // Health check
  app.get('/health', async () => {
    return { status: 'ok' }
  })

  // Spawn session
  app.post<{ Body: { directory: string; sessionId: string } }>('/spawn', async (request, reply) => {
    try {
      const result = await options.onSpawnSession(request.body.directory, request.body.sessionId)
      return { success: true, ...result }
    } catch (error: any) {
      reply.status(500)
      return { success: false, error: error.message }
    }
  })

  // Stop session
  app.post<{ Body: { sessionId: string } }>('/stop', async (request, reply) => {
    const success = await options.onStopSession(request.body.sessionId)
    return { success }
  })

  // Listen on random port
  await app.listen({ port: 0, host: '127.0.0.1' })

  const address = app.server.address()
  const port = typeof address === 'object' && address !== null ? address.port : 0

  return { port, server: app.server }
}
