import Fastify from 'fastify'

interface ControlServerOptions {
  onSpawnSession: (directory: string, sessionId: string) => Promise<{ sessionId: string }>
  onStopSession: (sessionId: string) => Promise<boolean>
}

// Permission queue for Claude CLI hooks
const permissionRequests = new Map<string, { resolve: (value: boolean) => void; reject: (error: Error) => void }>()

export async function startControlServer(options: ControlServerOptions) {
  const app = Fastify({ logger: false })

  // Health check
  app.get('/health', async () => {
    return { status: 'ok' }
  })

  // Permission endpoint for Claude CLI hooks
  app.post<{ Body: { requestId: string; toolName: string; input: any } }>('/permission', async (request, reply) => {
    const { requestId, toolName, input } = request.body

    console.log(`[Control Server] Permission request ${requestId} for tool: ${toolName}`)

    // For now, auto-approve all permissions
    // TODO: Send to frontend for user approval
    return { allowed: true }
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

  // Try to listen on port 3002 first (for hook compatibility), fallback to random port
  let port = 3002
  try {
    await app.listen({ port, host: '127.0.0.1' })
  } catch (error) {
    // Port 3002 busy, use random port
    await app.listen({ port: 0, host: '127.0.0.1' })
    const address = app.server.address()
    port = typeof address === 'object' && address !== null ? address.port : 0
  }

  return { port, server: app.server }
}
