import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { spawn, ChildProcess } from 'child_process'
import { io, Socket } from 'socket.io-client'
import { startControlServer } from './controlServer.js'
import chalk from 'chalk'
import { LocalExecutor } from './local-executor.js'

const CONFIG_DIR = path.join(os.homedir(), '.boba')
const STATE_FILE = path.join(CONFIG_DIR, 'daemon.json')

interface DaemonState {
  pid: number
  port: number
  startTime: number
}

interface TrackedSession {
  sessionId: string
  executor: LocalExecutor
  workingDir: string
}

const sessions = new Map<string, TrackedSession>()

export async function startDaemon(authToken: string) {
  // Check if already running
  const existing = await getDaemonStatus()
  if (existing.running) {
    console.log(chalk.yellow('⚠ Daemon already running'))
    return
  }

  // Start control server (for local RPC)
  const { port, server } = await startControlServer({
    onSpawnSession: spawnClaudeSession,
    onStopSession: stopSession,
  })

  console.log(chalk.gray(`  Control server: http://localhost:${port}`))

  // Connect to cloud
  const CLOUD_URL = process.env.BOBA_CLOUD_URL || 'https://nuciform-patti-noncondensing.ngrok-free.dev'
  const socket = io(CLOUD_URL, {
    auth: {
      token: authToken,
      clientType: 'daemon'
    },
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: Infinity,
  })

  socket.on('connect', () => {
    console.log(chalk.green('✓ Connected to Boba Cloud'))
  })

  socket.on('disconnect', () => {
    console.log(chalk.yellow('⚠ Disconnected from cloud'))
  })

  // Register RPC handlers
  socket.on('spawn_session', async (data: { sessionId: string; directory: string; resumeFrom?: string }, callback) => {
    console.log(chalk.blue(`📂 Spawning session in ${data.directory}`))
    try {
      const result = await spawnClaudeSession(data.directory, data.sessionId, socket, data.resumeFrom)
      callback({ success: true, sessionId: result.sessionId })
    } catch (error: any) {
      callback({ success: false, error: error.message })
    }
  })

  socket.on('stop_session', async (data: { sessionId: string }, callback) => {
    console.log(chalk.blue(`🛑 Stopping session ${data.sessionId}`))
    const success = await stopSession(data.sessionId)
    callback({ success })
  })

  socket.on('cancel_session', async (data: { sessionId: string }) => {
    console.log(chalk.blue(`🚫 Cancelling session ${data.sessionId}`))
    await stopSession(data.sessionId)
    // Respawn
    try {
      const result = await spawnClaudeSession(process.env.DEFAULT_WORKSPACE_DIR || '/tmp/boba-sessions', data.sessionId, socket)
      socket.emit('session_cancelled', { sessionId: data.sessionId })
    } catch (error: any) {
      socket.emit('error', { sessionId: data.sessionId, error: error.message })
    }
  })

  // Handle user messages from cloud
  socket.on('user_message', async (data: { sessionId: string; content: string }) => {
    console.log(chalk.blue(`💬 Message for session ${data.sessionId}`))
    const session = sessions.get(data.sessionId)

    if (session) {
      try {
        await session.executor.sendMessage(data.content)
      } catch (error: any) {
        console.error(chalk.red(`❌ Failed to send message: ${error.message}`))
        socket.emit('error', { sessionId: data.sessionId, error: error.message })
      }
    } else {
      console.error(chalk.red(`❌ Session ${data.sessionId} not found`))
      socket.emit('error', { sessionId: data.sessionId, error: 'Session not found' })
    }
  })

  // Handle permission responses from cloud
  socket.on('permission_response', (data: { sessionId: string; requestId: string; approved: boolean }) => {
    console.log(chalk.blue(`🔐 Permission response for session ${data.sessionId}: ${data.approved ? 'approved' : 'denied'}`))
    const session = sessions.get(data.sessionId)

    if (session) {
      session.executor.respondToPermission(data.requestId, data.approved)
    } else {
      console.error(chalk.red(`❌ Session ${data.sessionId} not found`))
    }
  })

  // Save state
  await fs.mkdir(CONFIG_DIR, { recursive: true })
  const state: DaemonState = {
    pid: process.pid,
    port,
    startTime: Date.now(),
  }
  await fs.writeFile(STATE_FILE, JSON.stringify(state), 'utf-8')

  console.log(chalk.green('✓ Daemon started'))
  console.log(chalk.gray(`  PID: ${process.pid}`))
  console.log(chalk.gray('\nDaemon is running. Press Ctrl+C to stop.'))

  // Keep process alive
  process.on('SIGINT', async () => {
    console.log(chalk.blue('\n🛑 Shutting down...'))
    socket.disconnect()
    server.close()
    await fs.unlink(STATE_FILE).catch(() => {})
    process.exit(0)
  })
}

export async function stopDaemon() {
  const state = await getDaemonStatus()
  if (!state.running || !state.pid) {
    throw new Error('Daemon is not running')
  }

  try {
    process.kill(state.pid, 'SIGTERM')
    await fs.unlink(STATE_FILE).catch(() => {})
  } catch (error) {
    throw new Error('Failed to stop daemon')
  }
}

export async function getDaemonStatus(): Promise<{ running: boolean; pid?: number; port?: number }> {
  try {
    const data = await fs.readFile(STATE_FILE, 'utf-8')
    const state: DaemonState = JSON.parse(data)

    // Check if process is still alive
    try {
      process.kill(state.pid, 0)
      return { running: true, pid: state.pid, port: state.port }
    } catch {
      // Process is dead, clean up state
      await fs.unlink(STATE_FILE).catch(() => {})
      return { running: false }
    }
  } catch (error) {
    return { running: false }
  }
}

async function spawnClaudeSession(directory: string, sessionId: string, cloudSocket?: any, resumeFrom?: string): Promise<{ sessionId: string }> {
  // Check if directory exists
  try {
    await fs.access(directory)
  } catch {
    // Create directory
    await fs.mkdir(directory, { recursive: true })
  }

  console.log(chalk.gray(`  Creating session ${sessionId} in ${directory}${resumeFrom ? ` (resuming ${resumeFrom})` : ''}`))

  // Create LocalExecutor instance
  const executor = new LocalExecutor({
    workingDir: directory,
    claudePath: 'claude',
    nodePath: 'node',
    resumeFrom,
  })

  // Set up permission callback
  executor.setPermissionCallback((request) => {
    console.log(chalk.yellow(`🔐 Permission request: ${request.toolName}`))
    if (cloudSocket) {
      cloudSocket.emit('permission_request', {
        sessionId,
        requestId: request.requestId,
        toolName: request.toolName,
        input: request.input,
      })
    }
  })

  // Set up session ID callback to capture Claude's real session ID
  executor.setSessionIdCallback((claudeSessionId) => {
    console.log(chalk.blue(`📋 Claude session ID: ${claudeSessionId}`))
    if (cloudSocket) {
      cloudSocket.emit('claude_session_id', {
        sessionId,
        claudeSessionId,
      })
    }
  })

  // Connect and start session
  await executor.connect()

  await executor.startInteractiveSession({
    onOutput: (data) => {
      // Forward raw stream-json output to cloud
      if (cloudSocket) {
        cloudSocket.emit('claude_message', {
          sessionId,
          content: data,
        })
      }
    },
    onError: (data) => {
      console.error(chalk.red(`[Claude ${sessionId}]`), data)
    },
    onExit: (code) => {
      console.log(chalk.gray(`  Session ${sessionId} exited with code ${code}`))
      sessions.delete(sessionId)
      if (cloudSocket) {
        cloudSocket.emit('session_ended', { sessionId, code })
      }
    },
  })

  // Track session
  sessions.set(sessionId, {
    sessionId,
    executor,
    workingDir: directory,
  })

  console.log(chalk.green(`✓ Session ${sessionId} ready`))

  // Notify cloud
  if (cloudSocket) {
    cloudSocket.emit('session_ready', {
      sessionId,
      claudeSessionId: sessionId,
    })
  }

  return { sessionId }
}

async function stopSession(sessionId: string): Promise<boolean> {
  const session = sessions.get(sessionId)
  if (session) {
    try {
      await session.executor.disconnect()
      sessions.delete(sessionId)
      console.log(chalk.gray(`  Stopped session ${sessionId}`))
      return true
    } catch (error: any) {
      console.error(chalk.red(`❌ Failed to stop session ${sessionId}: ${error.message}`))
      return false
    }
  }
  console.error(chalk.red(`❌ Session ${sessionId} not found`))
  return false
}

// Entry point when run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const authToken = process.env.USER_AUTH_TOKEN
  if (!authToken) {
    console.error(chalk.red('❌ USER_AUTH_TOKEN environment variable not set'))
    process.exit(1)
  }
  startDaemon(authToken).catch((error) => {
    console.error(chalk.red('❌ Failed to start daemon:'), error)
    process.exit(1)
  })
}
