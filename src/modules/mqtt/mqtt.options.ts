import type { IClientOptions } from 'mqtt'
import { ConfigurableModuleBuilder } from '@nestjs/common'

export interface MqttOptions {
  url: string
  clientOptions?: Omit<IClientOptions, 'manualConnect' | 'resubscribe'>
}

export const { ConfigurableModuleClass, MODULE_OPTIONS_TOKEN } = new ConfigurableModuleBuilder<MqttOptions>().build()
