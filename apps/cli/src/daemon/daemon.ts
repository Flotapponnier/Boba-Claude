import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { spawn, ChildProcess } from 'child_process'
import { io, Socket } from 'socket.io-client'
import { startControlServer } from './controlServer.js'
import chalk from 'chalk'

const CONFIG_DIR = path.join(os.homedir(), '.boba')
const STATE_FILE = path.join(CONFIG_DIR, 'daemon.json')

interface DaemonState {
  pid: number
  port: number
  startTime: number
}

interface TrackedSession {
  pid: number
  sessionId: string | null
  process: ChildProcess
}

const sessions = new Map<number, TrackedSession>()

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
  socket.on('spawn_session', async (data: { sessionId: string; directory: string }, callback) => {
    console.log(chalk.blue(`📂 Spawning session in ${data.directory}`))
    try {
      const result = await spawnClaudeSession(data.directory, data.sessionId, socket)
      callback({ success: true, sessionId: result.sessionId })
    } catch (error: any) {
      callback({ success: false, error: error.message })
    }
  })

  socket.on('stop_session', async (data: { sessionId: string }, callback) => {
    console.log(chalk.blue(`🛑 Stopping session ${data.sessionId}`))
    const success = stopSession(data.sessionId)
    callback({ success })
  })

  // Handle user messages from cloud
  socket.on('user_message', (data: { sessionId: string; content: string }) => {
    console.log(chalk.blue(`💬 Message for session ${data.sessionId}`))
    const session = sessions.get(Number(Object.keys(sessions).find(pid => {
      const s = sessions.get(Number(pid))
      return s?.sessionId === data.sessionId
    })))

    if (session?.process.stdin) {
      const message = JSON.stringify({
        type: 'user',
        message: {
          role: 'user',
          content: data.content
        }
      })
      session.process.stdin.write(message + '\n')
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

async function spawnClaudeSession(directory: string, sessionId: string, cloudSocket?: any): Promise<{ sessionId: string }> {
  // Check if directory exists
  try {
    await fs.access(directory)
  } catch {
    // Create directory
    await fs.mkdir(directory, { recursive: true })
  }

  // Spawn Claude CLI
  const claudeProcess = spawn('claude', [], {
    cwd: directory,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  if (!claudeProcess.pid) {
    throw new Error('Failed to spawn Claude process')
  }

  console.log(chalk.gray(`  Spawned Claude PID: ${claudeProcess.pid}`))

  // Track session
  sessions.set(claudeProcess.pid, {
    pid: claudeProcess.pid,
    sessionId,
    process: claudeProcess,
  })

  // Forward Claude output to cloud
  if (cloudSocket) {
    claudeProcess.stdout?.on('data', (data) => {
      const lines = data.toString().split('\n').filter((line: string) => line.trim())
      for (const line of lines) {
        try {
          const message = JSON.parse(line)

          // Forward system/init messages
          if (message.type === 'system' && message.subtype === 'init') {
            cloudSocket.emit('session_ready', {
              sessionId,
              claudeSessionId: message.session_id,
            })
          }

          // Forward assistant messages
          if (message.type === 'assistant') {
            const messageObj = message.message
            if (messageObj && Array.isArray(messageObj.content)) {
              const text = messageObj.content
                .filter((c: any) => c.type === 'text')
                .map((c: any) => c.text)
                .join('')

              if (text) {
                cloudSocket.emit('claude_message', {
                  sessionId,
                  message: {
                    type: 'text',
                    text,
                    role: 'assistant',
                  },
                })
              }

              const toolUses = messageObj.content.filter((c: any) => c.type === 'tool_use')
              for (const toolUse of toolUses) {
                cloudSocket.emit('claude_message', {
                  sessionId,
                  tool: {
                    type: 'tool_use',
                    id: toolUse.id,
                    name: toolUse.name,
                    input: toolUse.input,
                  },
                })
              }
            }
          }
        } catch (e) {
          console.log(`[Claude ${sessionId}]`, line)
        }
      }
    })
  }

  // Handle exit
  claudeProcess.on('exit', (code) => {
    sessions.delete(claudeProcess.pid!)
    if (cloudSocket) {
      cloudSocket.emit('session_ended', { sessionId, code })
    }
  })

  return { sessionId }
}

function stopSession(sessionId: string): boolean {
  for (const [pid, session] of sessions.entries()) {
    if (session.sessionId === sessionId) {
      try {
        session.process.kill('SIGTERM')
        sessions.delete(pid)
        return true
      } catch {
        return false
      }
    }
  }
  return false
}
