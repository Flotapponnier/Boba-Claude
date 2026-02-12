import { createServer, IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'socket.io-client'

interface PermissionRequest {
  toolName: string
  input: any
  requestId: string
}

interface PermissionResponse {
  requestId: string
  allowed: boolean
}

export class HookServer {
  private server: any
  private socket: Socket | null = null
  private pendingRequests = new Map<string, (allowed: boolean) => void>()
  private port: number

  constructor(port: number = 3001) {
    this.port = port
    this.server = createServer(this.handleRequest.bind(this))
  }

  setSocket(socket: Socket) {
    this.socket = socket

    // Listen for permission responses from frontend
    socket.on('permission_response', (data: PermissionResponse) => {
      const resolver = this.pendingRequests.get(data.requestId)
      if (resolver) {
        resolver(data.allowed)
        this.pendingRequests.delete(data.requestId)
      }
    })
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

    if (req.method === 'OPTIONS') {
      res.writeHead(200)
      res.end()
      return
    }

    if (req.method !== 'POST') {
      res.writeHead(405)
      res.end(JSON.stringify({ error: 'Method not allowed' }))
      return
    }

    // Parse request body
    let body = ''
    req.on('data', chunk => body += chunk)
    req.on('end', async () => {
      try {
        const data: PermissionRequest = JSON.parse(body)

        if (!this.socket || !this.socket.connected) {
          console.error('[Hook Server] No socket connection')
          res.writeHead(403)
          res.end(JSON.stringify({ allowed: false, error: 'Not connected' }))
          return
        }

        // Forward permission request to frontend via socket
        this.socket.emit('permission_request', data)

        // Wait for response with 30s timeout
        const allowed = await new Promise<boolean>((resolve) => {
          this.pendingRequests.set(data.requestId, resolve)

          setTimeout(() => {
            if (this.pendingRequests.has(data.requestId)) {
              this.pendingRequests.delete(data.requestId)
              resolve(false) // Deny on timeout
            }
          }, 30000)
        })

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ allowed }))
      } catch (err) {
        console.error('[Hook Server] Error:', err)
        res.writeHead(400)
        res.end(JSON.stringify({ error: 'Invalid request' }))
      }
    })
  }

  start() {
    return new Promise<void>((resolve) => {
      this.server.listen(this.port, () => {
        console.log(`[Hook Server] Listening on port ${this.port}`)
        resolve()
      })
    })
  }

  stop() {
    return new Promise<void>((resolve) => {
      this.server.close(() => {
        console.log('[Hook Server] Stopped')
        resolve()
      })
    })
  }
}
