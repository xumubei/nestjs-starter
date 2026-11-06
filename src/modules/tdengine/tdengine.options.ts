import { ConfigurableModuleBuilder } from '@nestjs/common'

export interface TdengineOptions {
  url: string
  timeoutMs?: number
}

export const { ConfigurableModuleClass, MODULE_OPTIONS_TOKEN } = new ConfigurableModuleBuilder<TdengineOptions>().build()
