import { Module } from '@nestjs/common'
import { ConfigurableModuleClass } from './tdengine.options.js'
import { TdengineService } from './tdengine.service.js'

@Module({
  providers: [TdengineService],
  exports: [TdengineService],
})
export class TdengineModule extends ConfigurableModuleClass {}
