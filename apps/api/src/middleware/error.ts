import type { FastifyError, FastifyRequest, FastifyReply } from 'fastify'
import { logger } from '../utils/logger'
import { env } from '../config/env'

/**
 * Global error handler
 */
export function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply
) {
  // Log the error
  logger.error({
    err: error,
    req: {
      method: request.method,
      url: request.url,
      headers: request.headers,
    },
  })

  // Validation errors
  if (error.validation) {
    return reply.status(400).send({
      error: 'Validation error',
      details: error.validation,
    })
  }

  // JWT errors
  if (error.statusCode === 401) {
    return reply.status(401).send({
      error: 'Unauthorized',
    })
  }

  // Default to 500
  const statusCode = error.statusCode || 500
  const message = env.isProduction ? 'Internal server error' : error.message

  return reply.status(statusCode).send({
    error: message,
  })
}
