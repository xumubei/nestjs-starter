import { Controller, Get, ServiceUnavailableException } from '@nestjs/common'
import { ApiOkResponse, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger'
import { Public } from '../auth/public.decorator.js'
import { DatabaseService } from '../database/database.service.js'

@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly database: DatabaseService) {}

  @Get()
  @ApiOkResponse({
    schema: {
      example: { status: 'ok' },
    },
  })
  check(): { status: 'ok' } {
    return { status: 'ok' }
  }

  @Get('ready')
  @ApiServiceUnavailableResponse({ description: 'PostgreSQL is unavailable or migrations are missing' })
  async ready(): Promise<{ status: 'ok' }> {
    try {
      const { rowCount } = await this.database.pool.query('SELECT 1 FROM pgmigrations LIMIT 1')
      if (!rowCount) {
        throw new Error('No migrations applied')
      }
      return { status: 'ok' }
    }
    catch (cause) {
      throw new ServiceUnavailableException('Database not ready', { cause })
    }
  }
}
