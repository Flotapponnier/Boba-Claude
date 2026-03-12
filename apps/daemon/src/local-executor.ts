/**
 * Local Executor - Spawns Claude CLI locally (not via SSH)
 * Inspired by Happy CLI's approach
 */
import { spawn, ChildProcess } from 'node:child_process'

export interface LocalExecutorConfig {
  workingDir: string
  claudePath?: string // Path to Claude CLI, defaults to 'claude' in PATH
}

export class LocalExecutor {
  private config: LocalExecutorConfig
  private claudePath: string

  constructor(config: LocalExecutorConfig) {
    this.config = config
    this.claudePath = config.claudePath || 'claude'
  }

  async connect(): Promise<void> {
    // For local execution, just verify Claude CLI exists
    try {
      const { execSync } = await import('child_process')
      execSync(`command -v ${this.claudePath}`, { stdio: 'pipe' })
      console.log(`[Local Executor] Found Claude CLI: ${this.claudePath}`)
    } catch (error) {
      throw new Error(`Claude CLI not found in PATH. Please install: npm install -g @anthropic/claude`)
    }
  }

  async disconnect(): Promise<void> {
    // No persistent connection to close for local execution
    console.log('[Local Executor] Disconnected (no-op for local)')
  }

  async executeCommand(command: string): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      console.log(`[Local Executor] Executing: ${command}`)

      const child = spawn('sh', ['-c', command], {
        cwd: this.config.workingDir,
        env: process.env,
      })

      let stdout = ''
      let stderr = ''

      child.stdout?.on('data', (data) => {
        stdout += data.toString()
      })

      child.stderr?.on('data', (data) => {
        stderr += data.toString()
      })

      child.on('error', (error) => {
        reject(error)
      })

      child.on('close', (code) => {
        if (code === 0 || stdout) {
          resolve({ stdout, stderr })
        } else {
          reject(new Error(`Command failed with code ${code}: ${stderr}`))
        }
      })
    })
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
}
