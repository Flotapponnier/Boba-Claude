export const constants = {
  // API
  API_PREFIX: '/api/v1',

  // Auth
  JWT_EXPIRES_IN: '7d',
  BCRYPT_ROUNDS: 10,

  // Claude
  CLAUDE_AUTH_URL: 'https://claude.ai/oauth/authorize',
  CLAUDE_TOKEN_URL: 'https://console.anthropic.com/v1/oauth/token',
  CLAUDE_SCOPE: 'user:inference',
  CLAUDE_SUCCESS_REDIRECT: 'https://console.anthropic.com/oauth/code/success?app=claude-code',

  // Rate limiting
  RATE_LIMIT_MAX: 100,
  RATE_LIMIT_TIME_WINDOW: '15 minutes',

  // WebSocket
  WS_HEARTBEAT_INTERVAL: 30000, // 30 seconds
  WS_TIMEOUT: 60000, // 60 seconds
} as const

export type Constants = typeof constants
