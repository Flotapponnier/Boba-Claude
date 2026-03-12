import { FastifyInstance } from 'fastify'
import { readFileSync, existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

export async function daemonRoutes(app: FastifyInstance) {
  // Get daemon token from CLI config file
  app.get('/daemon/token', async (request, reply) => {
    const configPath = join(homedir(), '.boba', 'config.json')

    if (!existsSync(configPath)) {
      return reply.status(404).send({
        error: 'No daemon config found',
        message: 'Run "boba login" first'
      })
    }

    try {
      const config = JSON.parse(readFileSync(configPath, 'utf-8'))

      if (!config.token || !config.userId) {
        return reply.status(404).send({
          error: 'Invalid daemon config',
          message: 'Run "boba login" first'
        })
      }

      return {
        token: config.token,
        userId: config.userId
      }
    } catch (err) {
      return reply.status(500).send({
        error: 'Failed to read daemon config'
      })
    }
  })
}
