// @env node
import type { OnModuleDestroy } from '@nestjs/common'
import type { PoolClient } from 'pg'
import type { AppConfig } from '../config/types.js'
import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Pool } from 'pg'

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  readonly pool: Pool

  constructor(config: ConfigService<AppConfig, true>) {
    this.pool = new Pool({
      connectionString: config.get('DATABASE_URL', { infer: true }),
      connectionTimeoutMillis: 3000,
      statement_timeout: 5000,
      query_timeout: 6000,
    })

    const logger = new Logger(DatabaseService.name)
    this.pool.on('error', (error: Error) => logger.error(error.message))
  }

  async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect()
    let discard = false
    try {
      await client.query('BEGIN')
      const result = await work(client)
      await client.query('COMMIT')
      return result
    }
    catch (error) {
      try {
        await client.query('ROLLBACK')
      }
      catch {
        discard = true
      }
      throw error
    }
    finally {
      client.release(discard)
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end()
  }
}
