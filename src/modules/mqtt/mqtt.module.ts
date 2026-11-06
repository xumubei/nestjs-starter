import { Module } from '@nestjs/common'
import { ConfigurableModuleClass } from './mqtt.options.js'
import { MqttService } from './mqtt.service.js'

@Module({
  providers: [MqttService],
  exports: [MqttService],
})
export class MqttModule extends ConfigurableModuleClass {}
