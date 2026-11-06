import { ConfigurableModuleBuilder } from '@nestjs/common'

export interface RedisOptions {
  url: string
  connectTimeoutMs?: number
}

export const { ConfigurableModuleClass, MODULE_OPTIONS_TOKEN } = new ConfigurableModuleBuilder<RedisOptions>().build()
