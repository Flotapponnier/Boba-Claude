import { buildServer } from './server'
import { env } from './config/env'
import { logger } from './utils/logger'

async function start() {
  try {
    const server = await buildServer()

    await server.listen({
      port: parseInt(env.PORT),
      host: '0.0.0.0',
    })

    logger.info(`Server listening on port ${env.PORT}`)
  } catch (err) {
    logger.error(err)
    process.exit(1)
  }
}

start()
