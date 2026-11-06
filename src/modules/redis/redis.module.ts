import { Module } from '@nestjs/common'
import { ConfigurableModuleClass } from './redis.options.js'
import { RedisService } from './redis.service.js'

@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule extends ConfigurableModuleClass {}
