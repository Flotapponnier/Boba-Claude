import crypto from 'crypto'
import { env } from '../config/env'

const algorithm = 'aes-256-gcm'
const key = Buffer.from(env.ENCRYPTION_KEY, 'hex') // 32 bytes

/**
 * Encrypt a string using AES-256-GCM
 * Format: iv:authTag:encrypted
 */
export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv(algorithm, key, iv)

  let encrypted = cipher.update(plaintext, 'utf8', 'hex')
  encrypted += cipher.final('hex')

  const authTag = cipher.getAuthTag()

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`
}

/**
 * Decrypt a string encrypted with encrypt()
 */
export function decrypt(ciphertext: string): string {
  const [ivHex, authTagHex, encryptedData] = ciphertext.split(':')

  if (!ivHex || !authTagHex || !encryptedData) {
    throw new Error('Invalid ciphertext format')
  }

  const decipher = crypto.createDecipheriv(
    algorithm,
    key,
    Buffer.from(ivHex, 'hex')
  )

  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'))

  let decrypted = decipher.update(encryptedData, 'hex', 'utf8')
  decrypted += decipher.final('utf8')

  return decrypted
}

/**
 * Generate a random state for OAuth
 */
export function generateState(): string {
  return crypto.randomBytes(32).toString('base64url')
}

/**
 * Generate PKCE codes for OAuth
 */
export function generatePKCE(): { verifier: string; challenge: string } {
  // Generate code verifier (43-128 characters, base64url)
  const verifier = crypto
    .randomBytes(32)
    .toString('base64url')
    .replace(/[^a-zA-Z0-9\-._~]/g, '')

  // Generate code challenge (SHA256 of verifier, base64url encoded)
  const challenge = crypto
    .createHash('sha256')
    .update(verifier)
    .digest('base64url')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')

  return { verifier, challenge }
}
