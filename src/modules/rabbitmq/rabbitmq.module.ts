import { Module } from '@nestjs/common'
import { ConfigurableModuleClass } from './rabbitmq.options.js'
import { RabbitMqService } from './rabbitmq.service.js'

@Module({
  providers: [RabbitMqService],
  exports: [RabbitMqService],
})
export class RabbitMqModule extends ConfigurableModuleClass {}
