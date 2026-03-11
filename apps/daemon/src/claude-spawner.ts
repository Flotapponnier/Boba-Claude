import { spawn, ChildProcess } from 'node:child_process'
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir, homedir } from 'node:os'
import { fileURLToPath } from 'node:url'

export interface ClaudeSpawnerOptions {
  hookPort: number
  claudeToken?: string // User's Claude OAuth token
  cwd?: string
  resumeFrom?: string // Optional: Claude session ID to resume
  onOutput?: (data: string) => void
  onExit?: (code: number | null) => void
  onHistoryLoaded?: (messages: any[]) => void // Callback with loaded history
}

/**
 * Load conversation history from Claude session file
 */
function loadSessionHistory(sessionId: string, projectCwd: string): any[] {
  try {
    // Convert project path to Claude's format: replace / with -
    const projectPath = projectCwd.replace(/\//g, '-')
    const sessionFile = join(homedir(), '.claude', 'projects', projectPath, `${sessionId}.jsonl`)

    if (!existsSync(sessionFile)) {
      console.log(`[ClaudeSpawner] No history file found: ${sessionFile}`)
      return []
    }

    const content = readFileSync(sessionFile, 'utf-8')
    const lines = content.trim().split('\n').filter(line => line.trim())

    const messages: any[] = []
    for (const line of lines) {
      try {
        const entry = JSON.parse(line)
        // Only include user and assistant messages (skip meta, summary, etc.)
        if (entry.type === 'user' && !entry.isMeta) {
          messages.push({
            role: 'user',
            content: entry.message.content,
            timestamp: entry.timestamp
          })
        } else if (entry.type === 'assistant' && entry.message?.content) {
          // Extract text from assistant message
          const text = entry.message.content
            .filter((c: any) => c.type === 'text')
            .map((c: any) => c.text)
            .join('')

          if (text) {
            messages.push({
              role: 'assistant',
              content: text,
              timestamp: entry.timestamp
            })
          }
        }
      } catch (e) {
        console.error('[ClaudeSpawner] Failed to parse history line:', e)
      }
    }

    console.log(`[ClaudeSpawner] Loaded ${messages.length} messages from history`)
    return messages
  } catch (error) {
    console.error('[ClaudeSpawner] Failed to load session history:', error)
    return []
  }
}

/**
 * Spawn Claude CLI with hooks configuration
 */
export function spawnClaude(options: ClaudeSpawnerOptions): ChildProcess {
  const { hookPort, claudeToken, cwd = process.cwd(), resumeFrom, onOutput, onExit, onHistoryLoaded } = options

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

  // Add --resume flag if resuming from existing session
  if (resumeFrom) {
    args.push('--resume', resumeFrom)
    console.log(`[ClaudeSpawner] Resuming Claude session: ${resumeFrom}`)

    // Load history from session file
    if (onHistoryLoaded) {
      const history = loadSessionHistory(resumeFrom, cwd)
      onHistoryLoaded(history)
    }
  }

  console.log(`[ClaudeSpawner] Spawning: claude ${args.join(' ')}`)

  // Set environment with user's Claude token if provided
  const env = { ...process.env }
  if (claudeToken) {
    env.ANTHROPIC_API_KEY = claudeToken
  }

  const child = spawn('claude', args, {
    cwd,
    stdio: ['pipe', 'pipe', 'inherit'], // pipe stdin/stdout for JSON communication
    env,
  })

  // Don't send initial message - let first user message trigger system/init
  // The first message from sendMessage() will trigger system/init naturally

  // Forward stdout
  child.stdout?.on('data', (data: Buffer) => {
    const text = data.toString()
    console.log(`[ClaudeSpawner] RAW STDOUT (${text.length} bytes):`, text.substring(0, 200))
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
