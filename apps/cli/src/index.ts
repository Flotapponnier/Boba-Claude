#!/usr/bin/env node
import { program } from 'commander'
import { spawn } from 'child_process'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import open from 'open'

const CONFIG_DIR = join(homedir(), '.boba')
const CONFIG_FILE = join(CONFIG_DIR, 'config.json')
const API_URL = process.env.BOBA_API_URL || 'http://localhost:3002'
const RELAY_URL = process.env.BOBA_RELAY_URL || 'http://localhost:3001'
const WEB_URL = process.env.BOBA_WEB_URL || 'http://localhost:3000'

interface Config {
  token?: string
  userId?: string
}

function getConfig(): Config {
  if (!existsSync(CONFIG_FILE)) {
    return {}
  }
  return JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'))
}

function saveConfig(config: Config) {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true })
  }
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2))
}

async function guestLogin(): Promise<string> {
  const response = await fetch(`${API_URL}/api/auth/guest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })

  if (!response.ok) {
    throw new Error('Failed to login as guest')
  }

  const data = await response.json() as { token: string }
  return data.token
}

program
  .name('boba')
  .description('Boba Claude CLI - Run Claude in your workspace')
  .version('0.1.0')

program
  .command('login')
  .description('Login and save your credentials')
  .action(async () => {
    console.log('🔐 Logging in as guest...')

    try {
      const token = await guestLogin()
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString())

      saveConfig({ token, userId: payload.userId })

      console.log('✅ Login successful!')
      console.log(`📝 Token saved to ${CONFIG_FILE}`)
      console.log(`🆔 User ID: ${payload.userId}`)
      console.log('\n🚀 Run "boba start" to launch your daemon')
    } catch (error) {
      console.error('❌ Login failed:', error instanceof Error ? error.message : error)
      process.exit(1)
    }
  })

program
  .command('start')
  .description('Start your personal Boba daemon')
  .action(() => {
    const config = getConfig()

    if (!config.token) {
      console.error('❌ No token found. Run "boba login" first')
      process.exit(1)
    }

    console.log('🚀 Starting Boba daemon...')
    console.log(`🔗 Connecting to relay: ${RELAY_URL}`)
    console.log(`👤 User ID: ${config.userId}`)
    console.log(`📂 Working directory: ${process.cwd()}`)
    console.log('\n✨ Daemon running! Open the web app to use Claude:\n')
    console.log(`   ${WEB_URL}\n`)

    const daemonScript = join(process.cwd(), 'apps/daemon/src/user-daemon.ts')

    if (!existsSync(daemonScript)) {
      console.error(`❌ Daemon script not found: ${daemonScript}`)
      console.error('Run this command from the Boba-Claude root directory')
      process.exit(1)
    }

    const daemon = spawn('npx', ['tsx', daemonScript], {
      env: {
        ...process.env,
        USER_AUTH_TOKEN: config.token,
        RELAY_URL,
      },
      stdio: 'inherit',
    })

    daemon.on('error', (error) => {
      console.error('❌ Failed to start daemon:', error.message)
      process.exit(1)
    })

    daemon.on('exit', (code) => {
      if (code !== 0) {
        console.error(`❌ Daemon exited with code ${code}`)
        process.exit(code || 1)
      }
    })

    process.on('SIGINT', () => {
      console.log('\n👋 Stopping daemon...')
      daemon.kill('SIGINT')
      process.exit(0)
    })
  })

program
  .command('web')
  .description('Open the Boba web interface')
  .action(async () => {
    console.log(`🌐 Opening ${WEB_URL}...`)
    await open(WEB_URL)
  })

program
  .command('status')
  .description('Show current configuration')
  .action(() => {
    const config = getConfig()

    console.log('📊 Boba Status\n')
    console.log(`Config file: ${CONFIG_FILE}`)
    console.log(`Logged in: ${config.token ? '✅ Yes' : '❌ No'}`)

    if (config.token) {
      console.log(`User ID: ${config.userId}`)
    }

    console.log(`\nRelay URL: ${RELAY_URL}`)
    console.log(`API URL: ${API_URL}`)
    console.log(`Web URL: ${WEB_URL}`)
  })

program.parse()
