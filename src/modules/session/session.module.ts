import { Module } from '@nestjs/common'
import { ConfigurableModuleClass } from './session.options.js'
import { SessionService } from './session.service.js'

/** Requires `RedisModule.register({ ..., isGlobal: true })` in the application. */
@Module({
  providers: [SessionService],
  exports: [SessionService],
})
export class SessionModule extends ConfigurableModuleClass {}
