import { Module } from '@nestjs/common'
import { ConfigurableModuleClass } from './kafka.options.js'
import { KafkaService } from './kafka.service.js'

@Module({
  providers: [KafkaService],
  exports: [KafkaService],
})
export class KafkaModule extends ConfigurableModuleClass {}
