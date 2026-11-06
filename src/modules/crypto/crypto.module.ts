import { Module } from '@nestjs/common'
import { ConfigurableModuleClass } from './crypto.options.js'
import { CryptoService } from './crypto.service.js'

@Module({
  providers: [CryptoService],
  exports: [CryptoService],
})
export class CryptoModule extends ConfigurableModuleClass {}
