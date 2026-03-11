import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16
const AUTH_TAG_LENGTH = 16

/**
 * Encrypt a string using AES-256-GCM
 * Returns Buffer containing: [IV (16 bytes)][Auth Tag (16 bytes)][Encrypted Data]
 */
export function encryptString(key: string, plaintext: string): Buffer {
  // Ensure key is 32 bytes
  const keyBuffer = Buffer.from(key.padEnd(32, '0').slice(0, 32), 'utf-8')
  const iv = randomBytes(IV_LENGTH)

  const cipher = createCipheriv(ALGORITHM, keyBuffer, iv)
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final()
  ])

  const authTag = cipher.getAuthTag()

  // Combine IV + authTag + encrypted data
  return Buffer.concat([iv, authTag, encrypted])
}

/**
 * Decrypt a Buffer encrypted with encryptString
 */
export function decryptString(key: string, encryptedBuffer: Buffer): string {
  // Ensure key is 32 bytes
  const keyBuffer = Buffer.from(key.padEnd(32, '0').slice(0, 32), 'utf-8')

  // Extract components
  const iv = encryptedBuffer.subarray(0, IV_LENGTH)
  const authTag = encryptedBuffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH)
  const encrypted = encryptedBuffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH)

  const decipher = createDecipheriv(ALGORITHM, keyBuffer, iv)
  decipher.setAuthTag(authTag)

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final()
  ])

  return decrypted.toString('utf8')
}
