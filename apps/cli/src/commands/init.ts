#!/usr/bin/env node
import { input, password, confirm } from '@inquirer/prompts'
import fs from 'fs'
import path from 'path'
import os from 'os'
import chalk from 'chalk'

const BOBA_DIR = path.join(os.homedir(), '.boba')
const TOKEN_FILE = path.join(BOBA_DIR, 'token')
const API_URL = process.env.BOBA_API_URL || 'http://localhost:3002'

export async function initCommand() {
  console.log(chalk.blue('\n🔧 Initialize Boba Workspace\n'))

  // Check if logged in
  if (!fs.existsSync(TOKEN_FILE)) {
    console.error(chalk.red('❌ Not logged in. Run `boba login` first.'))
    process.exit(1)
  }

  const token = fs.readFileSync(TOKEN_FILE, 'utf-8').trim()

  // Prompt for SSH configuration
  const workspaceName = await input({
    message: 'Workspace name:',
    default: 'my-workspace',
  })

  const sshHost = await input({
    message: 'SSH host (IP or domain):',
    default: '57.130.19.92',
  })

  const sshPort = await input({
    message: 'SSH port:',
    default: '8822',
  })

  const sshUser = await input({
    message: 'SSH username:',
    default: 'rescue',
  })

  const sshPassword = await password({
    message: 'SSH password (leave empty to use SSH key):',
    mask: '*',
  })

  const workingDir = await input({
    message: 'Working directory on remote machine:',
    default: '/home/rescue',
  })

  const isActive = await confirm({
    message: 'Set as active workspace?',
    default: true,
  })

  console.log(chalk.blue('\n📡 Creating workspace...'))

  // Create workspace via API
  try {
    const response = await fetch(`${API_URL}/api/workspaces`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: workspaceName,
        sshHost,
        sshPort: parseInt(sshPort, 10),
        sshUser,
        sshPassword: sshPassword || undefined,
        workingDir,
        isActive,
      }),
    })

    if (!response.ok) {
      const error = await response.json() as { error?: string }
      throw new Error(error.error || 'Failed to create workspace')
    }

    const { workspace } = await response.json() as { workspace: any }

    console.log(chalk.green('✓ Workspace created successfully!'))
    console.log(chalk.gray('\nWorkspace details:'))
    console.log(chalk.gray(`  ID: ${workspace.id}`))
    console.log(chalk.gray(`  Name: ${workspace.name}`))
    console.log(chalk.gray(`  SSH: ${workspace.sshUser}@${workspace.sshHost}:${workspace.sshPort}`))
    console.log(chalk.gray(`  Working directory: ${workspace.workingDir}`))
    console.log(chalk.gray(`  Active: ${workspace.isActive ? 'Yes' : 'No'}`))

    console.log(chalk.blue('\n🚀 Next steps:'))
    console.log(chalk.gray('  1. Run `boba chat "build something"` to start coding'))
    console.log(chalk.gray('  2. Or open the web UI to chat with Claude'))

  } catch (error: any) {
    console.error(chalk.red('❌ Failed to create workspace:'), error.message)
    process.exit(1)
  }
}
