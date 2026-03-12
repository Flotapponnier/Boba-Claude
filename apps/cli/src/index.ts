#!/usr/bin/env node

import chalk from 'chalk'
import { startDaemon, stopDaemon, getDaemonStatus } from './daemon/daemon.js'
import { login, logout, getStoredToken } from './commands/auth.js'
import { initCommand } from './commands/init.js'
import { chatCommand } from './commands/chat.js'

const args = process.argv.slice(2)
const command = args[0]

async function main() {
  if (command === 'login') {
    console.log(chalk.blue('🔐 Logging in to Boba Claude...'))
    await login()
    console.log(chalk.green('✓ Login successful!'))
    console.log(chalk.gray('\nNext: Run `boba start` to launch the local daemon'))
    return
  }

  if (command === 'logout') {
    await logout()
    console.log(chalk.green('✓ Logged out'))
    return
  }

  if (command === 'init') {
    await initCommand()
    return
  }

  if (command === 'chat') {
    const message = args.slice(1).join(' ')
    if (!message) {
      console.error(chalk.red('❌ Please provide a message'))
      console.log(chalk.gray('Example: boba chat "build a todo app"'))
      process.exit(1)
    }
    await chatCommand(message)
    return
  }

  if (command === 'start') {
    const token = await getStoredToken()
    if (!token) {
      console.log(chalk.red('✗ Not authenticated. Run `boba login` first.'))
      process.exit(1)
    }

    console.log(chalk.blue('🚀 Starting Boba daemon...'))
    await startDaemon(token)
    return
  }

  if (command === 'stop') {
    console.log(chalk.blue('🛑 Stopping Boba daemon...'))
    await stopDaemon()
    console.log(chalk.green('✓ Daemon stopped'))
    return
  }

  if (command === 'status') {
    const status = await getDaemonStatus()
    if (status.running) {
      console.log(chalk.green('✓ Daemon is running'))
      console.log(chalk.gray(`  PID: ${status.pid}`))
      console.log(chalk.gray(`  Port: ${status.port}`))
    } else {
      console.log(chalk.yellow('⚠ Daemon is not running'))
    }
    return
  }

  // Show help
  console.log(`
${chalk.bold('boba')} - Claude Code On the Go

${chalk.bold('Usage:')}
  boba login              Authenticate with Boba Cloud
  boba init               Configure SSH workspace (for cloud mode)
  boba chat "message"     Send a message to Claude (cloud mode)
  boba start              Start local daemon (connects your machine)
  boba stop               Stop local daemon
  boba status             Check daemon status
  boba logout             Logout

${chalk.bold('Examples:')}
  boba login                        # Login first
  boba init                         # Configure your remote workspace via SSH
  boba chat "build a todo app"      # Chat with Claude (cloud mode)
  boba start                        # Start daemon to expose your workspace (local mode)

${chalk.gray('Cloud mode: Configure SSH workspace with `boba init`')}
${chalk.gray('Local mode: Your Claude CLI runs on your machine')}
`)
}

main().catch((error) => {
  console.error(chalk.red('Error:'), error.message)
  process.exit(1)
})
