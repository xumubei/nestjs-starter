import { Module } from '@nestjs/common'
import { ConfigurableModuleClass } from './oss.options.js'
import { OssService } from './oss.service.js'

@Module({
  providers: [OssService],
  exports: [OssService],
})
export class OssModule extends ConfigurableModuleClass {}
