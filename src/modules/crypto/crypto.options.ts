import { ConfigurableModuleBuilder } from '@nestjs/common'

export interface CryptoOptions {
  /** 32 bytes encoded as 64 hexadecimal characters. */
  key: string
}

export const { ConfigurableModuleClass, MODULE_OPTIONS_TOKEN } = new ConfigurableModuleBuilder<CryptoOptions>().build()
