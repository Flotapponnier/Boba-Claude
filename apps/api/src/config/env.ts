import { z } from 'zod'
import * as dotenv from 'dotenv'

// Load environment variables
dotenv.config()

// Environment schema validation
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('4000'),
  HOST: z.string().default('0.0.0.0'),

  // Database
  DATABASE_URL: z.string(),

  // Security
  JWT_SECRET: z.string().min(32),
  ENCRYPTION_KEY: z.string().length(64), // 32 bytes in hex = 64 chars

  // Claude OAuth
  CLAUDE_CLIENT_ID: z.string(),
  CLAUDE_CALLBACK_PORT: z.string().default('54545'),

  // CORS
  FRONTEND_URL: z.string().url().default('http://localhost:3000'),

  // Logging
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
})

// Parse and validate environment variables
const parsedEnv = envSchema.safeParse(process.env)

if (!parsedEnv.success) {
  console.error('❌ Invalid environment variables:')
  console.error(parsedEnv.error.format())
  process.exit(1)
}

export const env = {
  ...parsedEnv.data,
  PORT: parseInt(parsedEnv.data.PORT),
  CLAUDE_CALLBACK_PORT: parseInt(parsedEnv.data.CLAUDE_CALLBACK_PORT),
  isDevelopment: parsedEnv.data.NODE_ENV === 'development',
  isProduction: parsedEnv.data.NODE_ENV === 'production',
  isTest: parsedEnv.data.NODE_ENV === 'test',
}

export type Env = typeof env
