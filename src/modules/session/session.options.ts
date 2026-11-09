import { ConfigurableModuleBuilder } from '@nestjs/common'

export interface SessionOptions {
  prefix?: string
  ttlSeconds?: number
}

export const { ConfigurableModuleClass, MODULE_OPTIONS_TOKEN } = new ConfigurableModuleBuilder<SessionOptions>().build()
