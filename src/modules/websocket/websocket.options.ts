// @env node
import type { IncomingMessage } from 'node:http'
import { ConfigurableModuleBuilder } from '@nestjs/common'

export interface WebSocketOptions {
  path?: string
  authenticate: (request: IncomingMessage) => string | null | Promise<string | null>
}

export const { ConfigurableModuleClass, MODULE_OPTIONS_TOKEN } = new ConfigurableModuleBuilder<WebSocketOptions>().build()
