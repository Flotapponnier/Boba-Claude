/**
 * Local Executor - Manages persistent interactive Claude CLI process
 * Uses Happy CLI wrapper approach to load Claude in-process
 */
import { spawn, ChildProcess } from 'node:child_process'
import { readlinkSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export interface LocalExecutorConfig {
  workingDir: string
  claudePath?: string
  nodePath?: string // Absolute path to node binary
}

interface PermissionRequest {
  requestId: string
  toolName: string
  input: unknown
}

interface PendingPermission {
  resolve: (approved: boolean) => void
  reject: (error: Error) => void
}

export class LocalExecutor {
  private config: LocalExecutorConfig
  private claudePath: string
  private process: ChildProcess | null = null
  private pendingPermissions = new Map<string, PendingPermission>()
  private onPermissionRequest?: (request: PermissionRequest) => void

  constructor(config: LocalExecutorConfig) {
    this.config = config
    this.claudePath = config.claudePath || 'claude'
  }

  setPermissionCallback(callback: (request: PermissionRequest) => void) {
    this.onPermissionRequest = callback
  }

  async connect(): Promise<void> {
    console.log('[Local Executor] Verifying Claude CLI exists')
  }

  async disconnect(): Promise<void> {
    console.log('[Local Executor] Disconnecting')
    if (this.process) {
      this.process.kill()
      this.process = null
    }
  }

  /**
   * Start interactive Claude process with Happy CLI wrapper
   * Loads Claude CLI in-process using the wrapper approach
   */
  async startInteractiveSession(callbacks: {
    onOutput: (data: string) => void
    onError: (data: string) => void
    onExit: (code: number | null) => void
  }): Promise<void> {
    if (this.process) {
      throw new Error('Session already running')
    }

    // Resolve Claude CLI path
    let resolvedPath = this.claudePath

    // If not an absolute path, try to find it in PATH
    if (!resolvedPath.startsWith('/')) {
      const { execSync } = await import('child_process')
      try {
        resolvedPath = execSync(`which ${this.claudePath}`, { encoding: 'utf-8' }).trim()
      } catch (error) {
        // which failed, try as-is
      }
    }

    // Now try to resolve symlink
    try {
      if (existsSync(resolvedPath)) {
        const realPath = readlinkSync(resolvedPath)
        if (!realPath.startsWith('/')) {
          const path = await import('path')
          resolvedPath = path.join(path.dirname(resolvedPath), realPath)
        } else {
          resolvedPath = realPath
        }
      }
    } catch {
      // Not a symlink, use resolved path as-is
    }

    console.log(`[Local Executor] Starting Claude with Happy CLI wrapper: ${resolvedPath}`)
    console.log(`[Local Executor] Node path: ${this.config.nodePath || 'node'}`)

    // Ensure working directory exists
    const { mkdirSync } = await import('fs')
    try {
      mkdirSync(this.config.workingDir, { recursive: true })
    } catch (error: any) {
      if (error.code !== 'EEXIST') {
        throw new Error(`Failed to create working directory: ${error.message}`)
      }
    }

    const nodePath = this.config.nodePath || 'node'
    const wrapperPath = join(__dirname, 'claude-wrapper.cjs')

    console.log(`[Local Executor] Using wrapper: ${wrapperPath}`)

    // Spawn Claude CLI with Happy CLI wrapper in programmatic mode
    this.process = spawn(nodePath, [
      wrapperPath,
      resolvedPath,
      '--output-format=stream-json',
      '--input-format=stream-json',
      '--permission-prompt-tool=stdio',
      '--verbose'
    ], {
      cwd: this.config.workingDir,
      env: {
        ...process.env,
        PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin',
        DISABLE_AUTOUPDATER: '1',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    console.log(`[Local Executor] Claude process spawned with PID ${this.process.pid}`)

    // Handle stdout - parse for control_request and forward relevant messages
    this.process.stdout?.on('data', (data) => {
      const lines = data.toString().split('\n')
      for (const line of lines) {
        if (!line.trim()) continue

        try {
          const msg = JSON.parse(line)

          // Handle permission requests (control_request) - don't forward to frontend
          if (msg.type === 'control_request' && msg.request?.subtype === 'can_use_tool') {
            this.handlePermissionRequest(msg)
            continue
          }

          // Only forward assistant/system/user messages, not control messages
          if (msg.type === 'assistant' || msg.type === 'system' || msg.type === 'user' || msg.type === 'result') {
            callbacks.onOutput(line + '\n')
          }
        } catch {
          // Not JSON, pass through as-is (error messages, etc.)
          callbacks.onOutput(line + '\n')
        }
      }
    })

    // Handle stderr
    this.process.stderr?.on('data', (data) => {
      callbacks.onError(data.toString())
    })

    // Handle exit
    this.process.on('exit', (code) => {
      console.log(`[Local Executor] Claude process exited with code ${code}`)
      this.process = null
      callbacks.onExit(code)
    })
  }

  /**
   * Send message to Claude process in stream-json format
   */
  async sendMessage(message: string): Promise<void> {
    if (!this.process) {
      throw new Error('No active Claude process')
    }

    // Format message as stream-json (newline-delimited JSON)
    // Claude CLI expects full Anthropic API message format
    const jsonMessage = JSON.stringify({
      type: 'user',
      message: {
        role: 'user',
        content: message,
      }
    })

    console.log(`[Local Executor] Writing to stdin (stream-json): ${message.substring(0, 50)}...`)
    this.process.stdin?.write(jsonMessage + '\n')
  }

  async fileExists(path: string): Promise<boolean> {
    try {
      const fs = await import('fs/promises')
      await fs.access(path)
      return true
    } catch {
      return false
    }
  }

  /**
   * Handle permission request from Claude CLI
   */
  private handlePermissionRequest(msg: any): void {
    const requestId = msg.request_id
    const toolName = msg.request.tool_name
    const input = msg.request.input

    console.log(`[Local Executor] Permission request: ${toolName}`)

    // Create promise that will be resolved when user responds
    const promise = new Promise<{ approved: boolean; input: any }>((resolve, reject) => {
      this.pendingPermissions.set(requestId, {
        resolve: (approved: boolean) => resolve({ approved, input }),
        reject
      })
    })

    // Notify callback
    if (this.onPermissionRequest) {
      this.onPermissionRequest({ requestId, toolName, input })
    }

    // Wait for response and send back to Claude
    promise.then(({ approved, input }) => {
      this.sendPermissionResponse(requestId, approved, input)
    }).catch((error) => {
      console.error('[Local Executor] Permission request error:', error)
      this.sendPermissionResponse(requestId, false, input)
    })
  }

  /**
   * Respond to a permission request
   */
  respondToPermission(requestId: string, approved: boolean): void {
    console.log(`[Local Executor] respondToPermission called for request ${requestId}: ${approved ? 'approved' : 'denied'}`)
    const pending = this.pendingPermissions.get(requestId)
    if (pending) {
      console.log(`[Local Executor] Found pending permission, resolving...`)
      this.pendingPermissions.delete(requestId)
      pending.resolve(approved)
    } else {
      console.error(`[Local Executor] No pending permission found for request ${requestId}`)
      console.error(`[Local Executor] Pending permissions:`, Array.from(this.pendingPermissions.keys()))
    }
  }

  /**
   * Send permission response back to Claude CLI via stdin
   */
  private sendPermissionResponse(requestId: string, approved: boolean, originalInput: any): void {
    if (!this.process) {
      console.error('[Local Executor] Cannot send permission response - no process')
      return
    }

    const response = {
      type: 'control_response',
      response: {
        subtype: 'success',
        request_id: requestId,
        response: {
          behavior: approved ? 'allow' : 'deny',
          ...(approved ? { updatedInput: originalInput as Record<string, unknown> } : { message: 'User denied permission' })
        }
      }
    }

    console.log(`[Local Executor] Sending permission response for request ${requestId}: ${approved ? 'allow' : 'deny'}`)
    console.log(`[Local Executor] Response JSON:`, JSON.stringify(response))
    this.process.stdin?.write(JSON.stringify(response) + '\n')
    console.log(`[Local Executor] Permission response sent successfully`)
  }
}
