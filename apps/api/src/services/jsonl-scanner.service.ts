import { EventEmitter } from 'events'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { logger } from '../utils/logger'
import { watch } from 'fs'

/**
 * JSONL line types from Claude CLI
 */
export type JSONLMessageType =
  | 'tool_use'
  | 'tool_result'
  | 'text'
  | 'thinking'
  | 'session_start'
  | 'session_end'
  | 'error'

export interface JSONLMessage {
  type: JSONLMessageType
  timestamp: string
  data: any
}

/**
 * JSONL Scanner Service
 * Monitors Claude CLI session files and parses JSONL output
 * Based on Happy.engineering's SessionScanner
 */
export class JSONLScanner extends EventEmitter {
  private sessionPath: string
  private lastPosition = 0
  private pollInterval: NodeJS.Timeout | null = null
  private watcher: fs.FSWatcher | null = null
  private sessionId: string
  private isScanning = false

  constructor(sessionId: string) {
    super()
    this.sessionId = sessionId

    // Claude CLI stores sessions in ~/.config/claude-cli/sessions/
    const claudeConfigDir = path.join(os.homedir(), '.config', 'claude-cli', 'sessions')
    this.sessionPath = path.join(claudeConfigDir, `${sessionId}.jsonl`)

    logger.info(`[JSONL Scanner] Initialized for session ${sessionId}`)
    logger.info(`[JSONL Scanner] Watching file: ${this.sessionPath}`)
  }

  /**
   * Start scanning session file
   */
  start() {
    if (this.isScanning) {
      return
    }

    this.isScanning = true

    // Wait for file to be created
    this.waitForFile()
      .then(() => {
        logger.info(`[JSONL Scanner] Session file found: ${this.sessionPath}`)

        // Start file watcher
        this.startFileWatcher()

        // Start polling (backup for file watcher)
        this.startPolling()

        // Initial scan
        this.scanFile()
      })
      .catch((error) => {
        logger.error(`[JSONL Scanner] Failed to find session file:`, error)
        this.emit('error', error)
      })
  }

  /**
   * Wait for session file to be created
   */
  private async waitForFile(timeout = 30000): Promise<void> {
    const startTime = Date.now()

    return new Promise((resolve, reject) => {
      const check = () => {
        if (fs.existsSync(this.sessionPath)) {
          resolve()
          return
        }

        if (Date.now() - startTime > timeout) {
          reject(new Error(`Session file not created after ${timeout}ms`))
          return
        }

        setTimeout(check, 500)
      }

      check()
    })
  }

  /**
   * Start file watcher
   */
  private startFileWatcher() {
    try {
      this.watcher = watch(this.sessionPath, (eventType) => {
        if (eventType === 'change') {
          this.scanFile()
        }
      })

      logger.info(`[JSONL Scanner] File watcher started`)
    } catch (error) {
      logger.error(`[JSONL Scanner] Failed to start file watcher:`, error)
    }
  }

  /**
   * Start polling (backup for file watcher)
   */
  private startPolling() {
    // Poll every 3 seconds like Happy does
    this.pollInterval = setInterval(() => {
      this.scanFile()
    }, 3000)

    logger.info(`[JSONL Scanner] Polling started (3s interval)`)
  }

  /**
   * Scan file for new lines
   */
  private scanFile() {
    try {
      // Read file from last position
      const fd = fs.openSync(this.sessionPath, 'r')
      const stats = fs.fstatSync(fd)

      // Check if file has new content
      if (stats.size <= this.lastPosition) {
        fs.closeSync(fd)
        return
      }

      // Read new content
      const bufferSize = stats.size - this.lastPosition
      const buffer = Buffer.alloc(bufferSize)
      fs.readSync(fd, buffer, 0, bufferSize, this.lastPosition)
      fs.closeSync(fd)

      // Update position
      this.lastPosition = stats.size

      // Parse new lines
      const content = buffer.toString('utf-8')
      const lines = content.split('\n').filter(line => line.trim())

      for (const line of lines) {
        this.parseLine(line)
      }

    } catch (error: any) {
      // Ignore ENOENT (file not created yet)
      if (error.code !== 'ENOENT') {
        logger.error(`[JSONL Scanner] Error scanning file:`, error)
      }
    }
  }

  /**
   * Parse JSONL line
   */
  private parseLine(line: string) {
    try {
      const message = JSON.parse(line) as JSONLMessage

      // Filter out internal events we don't need
      if (this.shouldEmitMessage(message)) {
        this.emit('message', message)
        logger.debug(`[JSONL Scanner] Parsed message type: ${message.type}`)
      }

    } catch (error) {
      logger.error(`[JSONL Scanner] Failed to parse line:`, line.substring(0, 100))
    }
  }

  /**
   * Check if message should be emitted to clients
   */
  private shouldEmitMessage(message: JSONLMessage): boolean {
    // Skip internal/technical events
    const skipTypes = ['session_start', 'session_metadata']

    if (skipTypes.includes(message.type)) {
      return false
    }

    return true
  }

  /**
   * Stop scanning
   */
  stop() {
    this.isScanning = false

    if (this.watcher) {
      this.watcher.close()
      this.watcher = null
    }

    if (this.pollInterval) {
      clearInterval(this.pollInterval)
      this.pollInterval = null
    }

    logger.info(`[JSONL Scanner] Stopped scanning session ${this.sessionId}`)
  }

  /**
   * Get current file position
   */
  getPosition(): number {
    return this.lastPosition
  }

  /**
   * Reset scanner to beginning of file
   */
  reset() {
    this.lastPosition = 0
    this.scanFile()
  }
}

/**
 * Scanner Manager - manages multiple session scanners
 */
export class ScannerManager {
  private scanners = new Map<string, JSONLScanner>()

  /**
   * Create and start scanner for session
   */
  createScanner(sessionId: string): JSONLScanner {
    // Stop existing scanner if any
    this.stopScanner(sessionId)

    const scanner = new JSONLScanner(sessionId)
    this.scanners.set(sessionId, scanner)
    scanner.start()

    return scanner
  }

  /**
   * Get scanner for session
   */
  getScanner(sessionId: string): JSONLScanner | undefined {
    return this.scanners.get(sessionId)
  }

  /**
   * Stop scanner for session
   */
  stopScanner(sessionId: string) {
    const scanner = this.scanners.get(sessionId)
    if (scanner) {
      scanner.stop()
      this.scanners.delete(sessionId)
    }
  }

  /**
   * Stop all scanners
   */
  stopAll() {
    for (const [sessionId, scanner] of this.scanners.entries()) {
      scanner.stop()
    }
    this.scanners.clear()
  }
}

export const scannerManager = new ScannerManager()
