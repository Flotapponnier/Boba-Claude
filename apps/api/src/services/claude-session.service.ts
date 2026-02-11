import { spawn, ChildProcess } from 'child_process'
import { EventEmitter } from 'events'
import { createInterface } from 'readline'
import { tokenService } from './token.service'
import { logger } from '../utils/logger'
import { randomUUID } from 'crypto'

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

  constructor() {
    super()
  }

  /**
   * Create new Claude Code session
   */
  async createSession(userId: string): Promise<string> {
    // Get OAuth token (from Claude.ai OAuth flow)
    const oauthToken = await tokenService.getToken(userId, 'anthropic')
    if (!oauthToken) {
      throw new Error('No Claude OAuth token found. Please connect your Claude account.')
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
      // Spawn Claude CLI with OAuth token
      await this.spawnClaude(sessionId, oauthToken)

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
   * Spawn Claude CLI process - just validate it works
   */
  private async spawnClaude(sessionId: string, oauthToken: string): Promise<void> {
    // Test that claude command works
    return new Promise((resolve, reject) => {
      const child = spawn('claude', ['--version'], {
        env: {
          ...process.env,
          CLAUDE_CODE_OAUTH_TOKEN: oauthToken,
        },
      })

      child.on('exit', (code) => {
        if (code === 0) {
          resolve()
        } else {
          reject(new Error(`Claude CLI not available (exit code: ${code})`))
        }
      })

      child.on('error', (error) => {
        reject(error)
      })

      setTimeout(() => reject(new Error('Claude CLI timeout')), 5000)
    })
  }

  /**
   * Handle structured Claude message from stream-json
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
   * Send message to Claude using --print with stream-json
   */
  async sendMessage(sessionId: string, message: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new Error(`Session ${sessionId} not found`)
    }

    if (session.status !== 'ready' && session.status !== 'running') {
      throw new Error(`Session ${sessionId} is not ready (status: ${session.status})`)
    }

    // Get OAuth token
    const oauthToken = await tokenService.getToken(session.userId, 'anthropic')
    if (!oauthToken) {
      throw new Error('OAuth token not found')
    }

    // Add user message to history
    session.messages.push({
      role: 'user',
      content: message,
      timestamp: new Date(),
    })

    session.status = 'running'
    session.isThinking = true
    this.emit('session:thinking', sessionId, true)

    logger.info(`[Session ${sessionId}] Sending message with --print: ${message.substring(0, 50)}...`)

    // Spawn claude with --print and --output-format stream-json
    const args = [
      '--print', message,
      '--output-format', 'stream-json',
      '--resume', sessionId,
    ]

    const child = spawn('claude', args, {
      env: {
        ...process.env,
        CLAUDE_CODE_OAUTH_TOKEN: oauthToken,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    // Parse JSONL from stdout
    const rl = createInterface({ input: child.stdout! })

    rl.on('line', (line) => {
      if (!line.trim()) return

      try {
        const msg = JSON.parse(line)
        this.handleClaudeMessage(sessionId, msg)
      } catch (err) {
        logger.debug(`[Session ${sessionId}] Non-JSON: ${line.substring(0, 100)}`)
      }
    })

    child.stderr?.on('data', (data: Buffer) => {
      logger.error(`[Session ${sessionId}] stderr: ${data.toString()}`)
    })

    child.on('exit', (code) => {
      session.isThinking = false
      session.status = code === 0 ? 'ready' : 'error'
      this.emit('session:thinking', sessionId, false)
      rl.close()
      logger.info(`[Session ${sessionId}] --print exited with ${code}`)
    })

    child.on('error', (error) => {
      session.isThinking = false
      session.status = 'error'
      this.emit('session:thinking', sessionId, false)
      logger.error(`[Session ${sessionId}] error:`, error)
    })
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
