import fs from 'fs/promises'
import path from 'path'
import os from 'os'

const CONFIG_DIR = path.join(os.homedir(), '.boba')
const TOKEN_FILE = path.join(CONFIG_DIR, 'token')

export async function login() {
  await fs.mkdir(CONFIG_DIR, { recursive: true })

  const API_URL = process.env.BOBA_API_URL || 'http://localhost:3002'
  const FRONTEND_URL = process.env.BOBA_FRONTEND_URL || 'http://localhost:3000'

  // Generate unique request ID
  const { randomBytes } = await import('crypto')
  const requestId = randomBytes(16).toString('hex')

  // Register CLI auth request
  const registerResponse = await fetch(`${API_URL}/api/auth/cli-request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestId }),
  })

  if (!registerResponse.ok) {
    throw new Error('Failed to initiate CLI authentication')
  }

  // Generate browser URL
  const authUrl = `${FRONTEND_URL}/cli-auth?requestId=${requestId}`

  console.log('\nOpening browser for authentication...')
  console.log('\nIf the browser does not open automatically, visit:')
  console.log(authUrl)
  console.log('')

  // Try to open browser
  try {
    const { exec } = await import('child_process')
    const openCommand = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open'
    exec(`${openCommand} "${authUrl}"`)
  } catch (err) {
    // Ignore browser open errors
  }

  // Poll for authorization
  console.log('Waiting for authorization...')
  let attempts = 0
  const maxAttempts = 120 // 2 minutes

  while (attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 1000))
    attempts++

    try {
      const pollResponse = await fetch(`${API_URL}/api/auth/cli-poll/${requestId}`)

      if (!pollResponse.ok) {
        if (pollResponse.status === 404) {
          throw new Error('Authentication request expired')
        }
        continue
      }

      const data = await pollResponse.json()

      if (data.state === 'authorized' && data.token) {
        await fs.writeFile(TOKEN_FILE, data.token, 'utf-8')
        return data.token
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('expired')) {
        throw err
      }
      // Continue polling on network errors
    }
  }

  throw new Error('Authentication timeout - please try again')
}

export async function logout() {
  try {
    await fs.unlink(TOKEN_FILE)
  } catch (error) {
    // Ignore if file doesn't exist
  }
}

export async function getStoredToken(): Promise<string | null> {
  try {
    return await fs.readFile(TOKEN_FILE, 'utf-8')
  } catch (error) {
    return null
  }
}
