import { Module } from '@nestjs/common'
import { ConfigurableModuleClass } from './websocket.options.js'
import { WebSocketService } from './websocket.service.js'

@Module({
  providers: [WebSocketService],
  exports: [WebSocketService],
})
export class WebSocketModule extends ConfigurableModuleClass {}
