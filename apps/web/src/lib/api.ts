const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002'

export async function guestLogin() {
  const response = await fetch(`${API_URL}/api/auth/guest`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  })

  if (!response.ok) {
    throw new Error('Failed to login as guest')
  }

  const data = await response.json()
  return data
}

export async function getClaudeLoginUrl(authToken: string) {
  const response = await fetch(`${API_URL}/api/auth/claude-login`, {
    headers: {
      'Authorization': `Bearer ${authToken}`,
    },
  })

  if (!response.ok) {
    throw new Error('Failed to get Claude login URL')
  }

  const data = await response.json()
  return data.authUrl
}

export async function getClaudeStatus(authToken: string) {
  const response = await fetch(`${API_URL}/api/auth/claude-status`, {
    headers: {
      'Authorization': `Bearer ${authToken}`,
    },
  })

  if (!response.ok) {
    throw new Error('Failed to get Claude status')
  }

  const data = await response.json()
  return data
}

export async function disconnectClaude(authToken: string) {
  const response = await fetch(`${API_URL}/api/auth/claude-disconnect`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${authToken}`,
    },
  })

  if (!response.ok) {
    throw new Error('Failed to disconnect Claude')
  }

  const data = await response.json()
  return data
}
