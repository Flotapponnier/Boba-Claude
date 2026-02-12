import { spawn, ChildProcess } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

export interface ClaudeSpawnerOptions {
  hookPort: number
  cwd?: string
  onOutput?: (data: string) => void
  onExit?: (code: number | null) => void
}

/**
 * Spawn Claude CLI with hooks configuration
 */
export function spawnClaude(options: ClaudeSpawnerOptions): ChildProcess {
  const { hookPort, cwd = process.cwd(), onOutput, onExit } = options

  // Create .claude directory and settings.json with hooks config
  const claudeDir = join(cwd, '.claude')
  mkdirSync(claudeDir, { recursive: true })

  const settingsConfig = {
    "hooks": {
      "PreToolUse": [
        {
          "matcher": "*",
          "hooks": [
            {
              "type": "command",
              "command": `response=$(curl -s -X POST http://localhost:${hookPort}/permission -H 'Content-Type: application/json' -d @-) && echo "$response" && echo "$response" | grep -q '"permissionDecision":"allow"'`
            }
          ]
        }
      ]
    }
  }

  const settingsPath = join(claudeDir, 'settings.json')
  writeFileSync(settingsPath, JSON.stringify(settingsConfig, null, 2))
  console.log(`[ClaudeSpawner] Created hooks config at ${settingsPath}`)

  // Spawn Claude in SDK mode (continuous conversation via JSON)
  const args = [
    '--output-format', 'stream-json',
    '--input-format', 'stream-json',
    '--verbose',
  ]
  console.log(`[ClaudeSpawner] Spawning: claude ${args.join(' ')}`)

  const child = spawn('claude', args, {
    cwd,
    stdio: ['pipe', 'pipe', 'inherit'], // pipe stdin/stdout for JSON communication
  })

  // Send initial message to start the conversation
  if (child.stdin) {
    const initialMessage = JSON.stringify({
      type: 'user',
      message: {
        role: 'user',
        content: 'Hello! I am ready to help.'
      }
    })
    child.stdin.write(initialMessage + '\n')
    console.log('[ClaudeSpawner] Sent initial message to Claude')
  }

  // Forward stdout
  child.stdout?.on('data', (data: Buffer) => {
    const text = data.toString()
    if (onOutput) {
      onOutput(text)
    }
  })

  // Handle exit
  child.on('exit', (code) => {
    console.log(`[ClaudeSpawner] Process exited with code ${code}`)
    if (onExit) {
      onExit(code)
    }
  })

  child.on('error', (error) => {
    console.error(`[ClaudeSpawner] Process error:`, error)
  })

  return child
}
