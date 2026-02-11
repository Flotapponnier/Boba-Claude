import { spawn, ChildProcess } from 'child_process'
import { EventEmitter } from 'events'
import { tokenService } from './token.service'
import { logger } from '../utils/logger'
import { randomUUID } from 'crypto'
import * as os from 'os'
import * as path from 'path'
import * as fs from 'fs'

export interface SessionMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

export interface SessionState {
  sessionId: string
  userId: string
  status: 'starting' | 'ready' | 'running' | 'error' | 'stopped'
  messages: SessionMessage[]
  isThinking: boolean
}

/**
 * Claude Code Session Manager
 * Spawns and manages Claude Code CLI processes
 * Based on Happy.engineering's architecture
 */
export class ClaudeSessionManager extends EventEmitter {
  private sessions = new Map<string, SessionState>()
  private processes = new Map<string, ChildProcess>()
  private sessionDir: string

  constructor() {
    super()
    this.sessionDir = path.join(os.homedir(), '.boba', 'sessions')
    this.ensureSessionDir()
  }

  /**
   * Ensure session directory exists
   */
  private ensureSessionDir() {
    if (!fs.existsSync(this.sessionDir)) {
      fs.mkdirSync(this.sessionDir, { recursive: true })
    }
  }

  /**
   * Create new Claude Code session
   */
  async createSession(userId: string): Promise<string> {
    // Get API key
    const apiKey = await tokenService.getToken(userId, 'anthropic-api' as any)
    if (!apiKey) {
      throw new Error('No API key found. Please save your API key first.')
    }

    const sessionId = randomUUID()

    // Initialize session state
    const sessionState: SessionState = {
      sessionId,
      userId,
      status: 'starting',
      messages: [],
      isThinking: false,
    }

    this.sessions.set(sessionId, sessionState)

    try {
      // Spawn Claude CLI
      await this.spawnClaude(sessionId, apiKey)

      sessionState.status = 'ready'
      this.emit('session:ready', sessionId)

      logger.info(`[Session ${sessionId}] Claude Code session created`)

      return sessionId
    } catch (error) {
      sessionState.status = 'error'
      logger.error(`[Session ${sessionId}] Failed to create session:`, error)
      throw error
    }
  }

  /**
   * Spawn Claude CLI process
   */
  private async spawnClaude(sessionId: string, apiKey: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Check if claude CLI is available
      const claudeCommand = 'claude'

      // Spawn process with API key in env
      const child = spawn(claudeCommand, [
        '--session-id', sessionId,
        '--json', // JSON output mode
      ], {
        env: {
          ...process.env,
          ANTHROPIC_AUTH_TOKEN: apiKey,
          CLAUDE_CLI_NO_HOOKS: 'true', // Disable hooks for now
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      this.processes.set(sessionId, child)

      // Handle stdout
      child.stdout?.on('data', (data: Buffer) => {
        const output = data.toString()
        this.handleClaudeOutput(sessionId, output)
      })

      // Handle stderr
      child.stderr?.on('data', (data: Buffer) => {
        logger.error(`[Session ${sessionId}] Claude stderr:`, data.toString())
      })

      // Handle process exit
      child.on('exit', (code) => {
        logger.info(`[Session ${sessionId}] Claude process exited with code ${code}`)
        const session = this.sessions.get(sessionId)
        if (session) {
          session.status = code === 0 ? 'stopped' : 'error'
          this.emit('session:exit', sessionId, code)
        }
        this.processes.delete(sessionId)
      })

      // Handle process errors
      child.on('error', (error) => {
        logger.error(`[Session ${sessionId}] Claude process error:`, error)
        reject(error)
      })

      // Wait a bit to see if process starts successfully
      setTimeout(() => {
        if (child.exitCode === null) {
          resolve()
        } else {
          reject(new Error(`Claude process failed to start (exit code: ${child.exitCode})`))
        }
      }, 1000)
    })
  }

  /**
   * Handle Claude output
   */
  private handleClaudeOutput(sessionId: string, output: string) {
    const session = this.sessions.get(sessionId)
    if (!session) return

    try {
      // Try to parse as JSON (if --json mode)
      const lines = output.trim().split('\n')
      for (const line of lines) {
        if (!line.trim()) continue

        try {
          const message = JSON.parse(line)
          this.handleClaudeMessage(sessionId, message)
        } catch {
          // Not JSON, treat as plain text
          this.emit('session:output', sessionId, line)
        }
      }
    } catch (error) {
      logger.error(`[Session ${sessionId}] Failed to parse Claude output:`, error)
    }
  }

  /**
   * Handle structured Claude message
   */
  private handleClaudeMessage(sessionId: string, message: any) {
    const session = this.sessions.get(sessionId)
    if (!session) return

    // Handle different message types
    if (message.type === 'thinking') {
      session.isThinking = message.status === 'start'
      this.emit('session:thinking', sessionId, session.isThinking)
    } else if (message.type === 'message') {
      const sessionMessage: SessionMessage = {
        role: message.role || 'assistant',
        content: message.content || '',
        timestamp: new Date(),
      }
      session.messages.push(sessionMessage)
      this.emit('session:message', sessionId, sessionMessage)
    } else if (message.type === 'error') {
      logger.error(`[Session ${sessionId}] Claude error:`, message)
      this.emit('session:error', sessionId, message)
    }

    this.emit('session:update', sessionId, session)
  }

  /**
   * Send message to Claude
   */
  async sendMessage(sessionId: string, message: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new Error(`Session ${sessionId} not found`)
    }

    if (session.status !== 'ready' && session.status !== 'running') {
      throw new Error(`Session ${sessionId} is not ready (status: ${session.status})`)
    }

    const process = this.processes.get(sessionId)
    if (!process || !process.stdin) {
      throw new Error(`Session ${sessionId} has no active process`)
    }

    // Add user message to history
    session.messages.push({
      role: 'user',
      content: message,
      timestamp: new Date(),
    })

    session.status = 'running'

    // Send to Claude via stdin
    process.stdin.write(message + '\n')

    logger.info(`[Session ${sessionId}] Sent message: ${message.substring(0, 50)}...`)
  }

  /**
   * Stop session
   */
  async stopSession(sessionId: string): Promise<void> {
    const process = this.processes.get(sessionId)
    if (process) {
      process.kill('SIGTERM')
      this.processes.delete(sessionId)
    }

    const session = this.sessions.get(sessionId)
    if (session) {
      session.status = 'stopped'
    }

    logger.info(`[Session ${sessionId}] Session stopped`)
  }

  /**
   * Get session state
   */
  getSession(sessionId: string): SessionState | undefined {
    return this.sessions.get(sessionId)
  }

  /**
   * List user sessions
   */
  getUserSessions(userId: string): SessionState[] {
    return Array.from(this.sessions.values())
      .filter(session => session.userId === userId)
  }

  /**
   * Clean up stopped sessions
   */
  cleanup() {
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.status === 'stopped' || session.status === 'error') {
        this.sessions.delete(sessionId)
        const process = this.processes.get(sessionId)
        if (process) {
          process.kill()
          this.processes.delete(sessionId)
        }
      }
    }
  }
}

export const claudeSessionManager = new ClaudeSessionManager()
