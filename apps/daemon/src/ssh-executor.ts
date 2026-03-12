import { Client as SSHClient, ConnectConfig } from 'ssh2'
import { Readable, Writable } from 'stream'

export interface SSHConfig {
  host: string
  port: number
  username: string
  password?: string
  privateKey?: Buffer
  workingDir: string
}

export class SSHExecutor {
  private client: SSHClient
  private config: SSHConfig
  private connected = false

  constructor(config: SSHConfig) {
    this.config = config
    this.client = new SSHClient()
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const connectConfig: ConnectConfig = {
        host: this.config.host,
        port: this.config.port,
        username: this.config.username,
        ...(this.config.password && { password: this.config.password }),
        ...(this.config.privateKey && { privateKey: this.config.privateKey }),
      }

      this.client
        .on('ready', () => {
          console.log('[SSH] Connected to', this.config.host)
          this.connected = true
          resolve()
        })
        .on('error', (err) => {
          console.error('[SSH] Connection error:', err)
          reject(err)
        })
        .connect(connectConfig)
    })
  }

  async disconnect(): Promise<void> {
    this.client.end()
    this.connected = false
  }

  async executeCommand(command: string): Promise<{ stdout: string; stderr: string; code: number }> {
    if (!this.connected) {
      throw new Error('SSH client not connected')
    }

    return new Promise((resolve, reject) => {
      // Change to working directory and execute command
      const fullCommand = `cd ${this.config.workingDir} && ${command}`

      this.client.exec(fullCommand, (err, stream) => {
        if (err) {
          reject(err)
          return
        }

        let stdout = ''
        let stderr = ''

        stream
          .on('close', (code: number) => {
            resolve({ stdout, stderr, code })
          })
          .on('data', (data: Buffer) => {
            stdout += data.toString()
          })
          .stderr.on('data', (data: Buffer) => {
            stderr += data.toString()
          })
      })
    })
  }

  // Stream-based execution for Claude CLI (interactive)
  async spawnClaude(stdin: Readable, stdout: Writable, stderr: Writable): Promise<number> {
    if (!this.connected) {
      throw new Error('SSH client not connected')
    }

    return new Promise((resolve, reject) => {
      // Launch Claude CLI in the working directory
      const command = `cd ${this.config.workingDir} && claude`

      this.client.exec(command, (err, stream) => {
        if (err) {
          reject(err)
          return
        }

        // Pipe stdin to SSH stream
        stdin.pipe(stream.stdin)

        // Pipe SSH stream to stdout/stderr
        stream.pipe(stdout)
        stream.stderr.pipe(stderr)

        stream.on('close', (code: number) => {
          resolve(code)
        })

        stream.on('error', (err: Error) => {
          reject(err)
        })
      })
    })
  }

  // Check if file exists on remote
  async fileExists(path: string): Promise<boolean> {
    try {
      const { code } = await this.executeCommand(`test -f ${path} && echo "exists"`)
      return code === 0
    } catch {
      return false
    }
  }

  // Read file from remote
  async readFile(path: string): Promise<string> {
    const { stdout, code } = await this.executeCommand(`cat ${path}`)
    if (code !== 0) {
      throw new Error(`Failed to read file: ${path}`)
    }
    return stdout
  }

  // Write file to remote
  async writeFile(path: string, content: string): Promise<void> {
    // Escape single quotes in content
    const escapedContent = content.replace(/'/g, "'\\''")
    const { code } = await this.executeCommand(`echo '${escapedContent}' > ${path}`)
    if (code !== 0) {
      throw new Error(`Failed to write file: ${path}`)
    }
  }

  isConnected(): boolean {
    return this.connected
  }
}
