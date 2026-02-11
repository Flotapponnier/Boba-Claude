import { createServer, IncomingMessage, ServerResponse, Server } from 'node:http'

export interface SessionHookData {
  session_id?: string
  sessionId?: string
  transcript_path?: string
  cwd?: string
  hook_event_name?: string
  source?: string
  [key: string]: unknown
}

export interface HookServerOptions {
  onSessionHook: (sessionId: string, data: SessionHookData) => void
}

export interface HookServer {
  port: number
  stop: () => void
}

/**
 * Start HTTP server to receive Claude session hooks
 */
export async function startHookServer(options: HookServerOptions): Promise<HookServer> {
  const { onSessionHook } = options

  return new Promise((resolve, reject) => {
    const server: Server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      if (req.method === 'POST' && req.url === '/hook/session-start') {
        const timeout = setTimeout(() => {
          if (!res.headersSent) {
            res.writeHead(408).end('timeout')
          }
        }, 5000)

        try {
          const chunks: Buffer[] = []
          for await (const chunk of req) {
            chunks.push(chunk as Buffer)
          }
          clearTimeout(timeout)

          const body = Buffer.concat(chunks).toString('utf-8')
          console.log('[hookServer] Received:', body)

          let data: SessionHookData = {}
          try {
            data = JSON.parse(body)
          } catch (parseError) {
            console.error('[hookServer] Failed to parse JSON:', parseError)
          }

          const sessionId = data.session_id || data.sessionId
          if (sessionId) {
            console.log(`[hookServer] Session ID: ${sessionId}`)
            onSessionHook(sessionId, data)
          } else {
            console.log('[hookServer] No session_id in data')
          }

          res.writeHead(200, { 'Content-Type': 'text/plain' }).end('ok')
        } catch (error) {
          clearTimeout(timeout)
          console.error('[hookServer] Error:', error)
          if (!res.headersSent) {
            res.writeHead(500).end('error')
          }
        }
        return
      }

      res.writeHead(404).end('not found')
    })

    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        reject(new Error('Failed to get server address'))
        return
      }

      const port = address.port
      console.log(`[hookServer] Listening on port ${port}`)

      resolve({
        port,
        stop: () => {
          server.close()
          console.log('[hookServer] Stopped')
        }
      })
    })

    server.on('error', (err) => {
      console.error('[hookServer] Error:', err)
      reject(err)
    })
  })
}
