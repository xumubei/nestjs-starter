import type { ClientOptions } from 'minio'
import { ConfigurableModuleBuilder } from '@nestjs/common'

export interface OssOptions {
  bucket: string
  client: ClientOptions
}

export const { ConfigurableModuleClass, MODULE_OPTIONS_TOKEN } = new ConfigurableModuleBuilder<OssOptions>().build()
