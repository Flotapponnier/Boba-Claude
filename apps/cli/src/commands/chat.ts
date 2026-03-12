#!/usr/bin/env node
import fs from 'fs'
import path from 'path'
import os from 'os'
import chalk from 'chalk'
import { io, Socket } from 'socket.io-client'

const BOBA_DIR = path.join(os.homedir(), '.boba')
const TOKEN_FILE = path.join(BOBA_DIR, 'token')
const WS_URL = process.env.BOBA_WS_URL || 'http://localhost:3001' // Cloud daemon URL

export async function chatCommand(message: string) {
  // Check if logged in
  if (!fs.existsSync(TOKEN_FILE)) {
    console.error(chalk.red('❌ Not logged in. Run `boba login` first.'))
    process.exit(1)
  }

  const token = fs.readFileSync(TOKEN_FILE, 'utf-8').trim()

  console.log(chalk.blue('💬 Connecting to Boba Cloud...'))

  // Connect to cloud daemon
  const socket: Socket = io(WS_URL, {
    transports: ['websocket'],
    auth: {
      token,
      clientType: 'cli',
    },
  })

  let sessionId: string | null = null

  socket.on('connect', () => {
    console.log(chalk.green('✓ Connected to cloud daemon'))

    // Create a new session (delay to let server setup handlers)
    sessionId = `cli-${Date.now()}`
    console.log(chalk.blue(`📝 Creating session ${sessionId}...`))

    setTimeout(() => {
      socket.emit('create_session', { sessionId })
    }, 100)
  })

  socket.on('session_ready', (data: { sessionId: string }) => {
    console.log(chalk.green(`✓ Session ready: ${data.sessionId}`))
    console.log(chalk.blue('🤖 Sending message to Claude...\n'))

    // Send the message
    socket.emit('message', {
      sessionId: data.sessionId,
      content: message,
    })
  })

  socket.on('claude_message', (data: any) => {
    if (data.message?.type === 'text') {
      console.log(chalk.white(data.message.text))
    } else if (data.tool) {
      console.log(chalk.gray(`\n[Tool: ${data.tool.name}]`))
      console.log(chalk.gray(JSON.stringify(data.tool.input, null, 2)))
    }
  })

  socket.on('output', (data: { content: string }) => {
    process.stdout.write(data.content)
  })

  socket.on('session_ended', (data: { sessionId: string; code: number }) => {
    console.log(chalk.gray(`\n✓ Session ended with code ${data.code}`))
    socket.disconnect()
    process.exit(0)
  })

  socket.on('error', (data: { error: string }) => {
    console.error(chalk.red(`\n❌ Error: ${data.error}`))
    socket.disconnect()
    process.exit(1)
  })

  socket.on('connect_error', (err: Error) => {
    console.error(chalk.red('❌ Failed to connect to cloud daemon:'), err.message)
    console.error(chalk.yellow('\nMake sure:'))
    console.error(chalk.yellow('  1. The cloud daemon is running'))
    console.error(chalk.yellow('  2. You have configured a workspace with `boba init`'))
    process.exit(1)
  })

  // Handle Ctrl+C
  process.on('SIGINT', () => {
    console.log(chalk.yellow('\n\n⚠ Interrupted by user'))
    if (sessionId) {
      socket.emit('cancel_session', { sessionId })
    }
    setTimeout(() => {
      socket.disconnect()
      process.exit(0)
    }, 500)
  })
}
