import { prisma } from '../db/client'
import { encrypt, decrypt } from '../utils/crypto'
import type { Token } from '@prisma/client'

export class TokenService {
  /**
   * Save an encrypted token for a user
   */
  async saveToken(
    userId: string,
    vendor: 'anthropic' | 'openai',
    token: string,
    expiresAt?: Date
  ): Promise<Token> {
    const encryptedToken = encrypt(token)

    return prisma.token.upsert({
      where: {
        userId_vendor: {
          userId,
          vendor,
        },
      },
      update: {
        token: encryptedToken,
        expiresAt,
        updatedAt: new Date(),
      },
      create: {
        userId,
        vendor,
        token: encryptedToken,
        expiresAt,
      },
    })
  }

  /**
   * Get and decrypt a token for a user
   */
  async getToken(
    userId: string,
    vendor: 'anthropic' | 'openai'
  ): Promise<string | null> {
    const tokenRecord = await prisma.token.findUnique({
      where: {
        userId_vendor: {
          userId,
          vendor,
        },
      },
    })

    if (!tokenRecord) {
      return null
    }

    // Check if expired
    if (tokenRecord.expiresAt && tokenRecord.expiresAt < new Date()) {
      await this.deleteToken(userId, vendor)
      return null
    }

    return decrypt(tokenRecord.token)
  }

  /**
   * Delete a token for a user
   */
  async deleteToken(
    userId: string,
    vendor: 'anthropic' | 'openai'
  ): Promise<void> {
    await prisma.token.delete({
      where: {
        userId_vendor: {
          userId,
          vendor,
        },
      },
    })
  }

  /**
   * Check if user has a valid token
   */
  async hasValidToken(
    userId: string,
    vendor: 'anthropic' | 'openai'
  ): Promise<boolean> {
    const token = await prisma.token.findUnique({
      where: {
        userId_vendor: {
          userId,
          vendor,
        },
      },
    })

    if (!token) {
      return false
    }

    // Check if expired
    if (token.expiresAt && token.expiresAt < new Date()) {
      return false
    }

    return true
  }
}

export const tokenService = new TokenService()
