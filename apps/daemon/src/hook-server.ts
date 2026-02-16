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
        const hookData = JSON.parse(body)
        console.log('[Hook Server] Received hook:', JSON.stringify(hookData, null, 2))

        if (!this.socket || !this.socket.connected) {
          console.error('[Hook Server] No socket connection')
          res.writeHead(403)
          res.end(JSON.stringify({ allowed: false, error: 'Not connected' }))
          return
        }

        // Auto-approve read-only tools
        const readOnlyTools = ['Read', 'Glob', 'Grep']
        const isReadOnly = readOnlyTools.includes(hookData.tool_name)

        let allowed: boolean

        if (isReadOnly) {
          console.log(`[Hook Server] Auto-approving read-only tool: ${hookData.tool_name}`)
          allowed = true
        } else {
          // Generate requestId for tracking
          const requestId = `${hookData.tool_name || 'unknown'}-${Date.now()}`

          // Format request for frontend
          const permissionRequest = {
            requestId,
            toolName: hookData.tool_name,
            input: hookData.tool_input,
          }

          // Forward permission request to frontend via socket
          this.socket.emit('permission_request', permissionRequest)
          console.log('[Hook Server] Sent permission request:', permissionRequest)

          // Wait for response with 30s timeout
          allowed = await new Promise<boolean>((resolve) => {
            this.pendingRequests.set(requestId, resolve)

            setTimeout(() => {
              if (this.pendingRequests.has(requestId)) {
                this.pendingRequests.delete(requestId)
                console.log('[Hook Server] Permission timeout, denying')
                resolve(false) // Deny on timeout
              }
            }, 30000)
          })
        }

        console.log('[Hook Server] Permission result:', allowed ? 'ALLOWED' : 'DENIED')
        res.writeHead(200, { 'Content-Type': 'application/json' })
        const hookResponse = {
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: allowed ? 'allow' : 'deny',
            permissionDecisionReason: allowed ? 'User approved' : 'User denied'
          }
        }
        res.end(JSON.stringify(hookResponse))
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
