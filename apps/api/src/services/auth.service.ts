import bcrypt from 'bcrypt'
import { prisma } from '../db/client'
import { constants } from '../config/constants'
import type { User } from '@prisma/client'

export class AuthService {
  /**
   * Hash a password using bcrypt
   */
  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, constants.BCRYPT_ROUNDS)
  }

  /**
   * Verify a password against a hash
   */
  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash)
  }

  /**
   * Create a new user
   */
  async createUser(data: {
    email: string
    password: string
    name?: string
  }): Promise<Omit<User, 'password'>> {
    // Check if user already exists
    const existing = await prisma.user.findUnique({
      where: { email: data.email },
    })

    if (existing) {
      throw new Error('User with this email already exists')
    }

    // Hash password
    const hashedPassword = await this.hashPassword(data.password)

    // Create user
    const user = await prisma.user.create({
      data: {
        email: data.email,
        password: hashedPassword,
        name: data.name,
      },
    })

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, ...userWithoutPassword } = user

    return userWithoutPassword
  }

  /**
   * Authenticate a user with email and password
   */
  async authenticateUser(email: string, password: string): Promise<Omit<User, 'password'> | null> {
    const user = await prisma.user.findUnique({
      where: { email },
    })

    if (!user) {
      return null
    }

    const isValidPassword = await this.verifyPassword(password, user.password)

    if (!isValidPassword) {
      return null
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _, ...userWithoutPassword } = user

    return userWithoutPassword
  }

  /**
   * Get user by ID
   */
  async getUserById(id: string): Promise<Omit<User, 'password'> | null> {
    const user = await prisma.user.findUnique({
      where: { id },
    })

    if (!user) {
      return null
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, ...userWithoutPassword } = user

    return userWithoutPassword
  }

  /**
   * Get user by email
   */
  async getUserByEmail(email: string): Promise<Omit<User, 'password'> | null> {
    const user = await prisma.user.findUnique({
      where: { email },
    })

    if (!user) {
      return null
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, ...userWithoutPassword } = user

    return userWithoutPassword
  }
}

export const authService = new AuthService()
