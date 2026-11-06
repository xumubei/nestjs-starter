import { ConfigurableModuleBuilder } from '@nestjs/common'

export interface RabbitMqOptions {
  url: string
  prefetch?: number
  maxAttempts?: number
}

export const { ConfigurableModuleClass, MODULE_OPTIONS_TOKEN } = new ConfigurableModuleBuilder<RabbitMqOptions>().build()
