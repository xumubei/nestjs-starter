import { ConfigurableModuleBuilder } from '@nestjs/common'

export interface RedisOptions {
  url: string
  connectTimeoutMs?: number
}

export const { ConfigurableModuleClass, MODULE_OPTIONS_TOKEN } = new ConfigurableModuleBuilder<RedisOptions>()
  // A global registration shares one client with modules such as SessionModule.
  .setExtras({ isGlobal: false }, (definition, { isGlobal }) => ({ ...definition, global: isGlobal }))
  .build()
