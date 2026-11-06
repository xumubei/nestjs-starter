import type { KafkaConfig } from 'kafkajs'
import { ConfigurableModuleBuilder } from '@nestjs/common'

export interface KafkaOptions extends KafkaConfig {
  maxAttempts?: number
  backoffMs?: number
}

export const { ConfigurableModuleClass, MODULE_OPTIONS_TOKEN } = new ConfigurableModuleBuilder<KafkaOptions>().build()
