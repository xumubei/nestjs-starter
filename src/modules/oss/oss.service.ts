// @env node
import type { Buffer } from 'node:buffer'
import type { Readable } from 'node:stream'
import type { OssOptions } from './oss.options.js'
import { Inject, Injectable } from '@nestjs/common'
import { Client } from 'minio'
import { MODULE_OPTIONS_TOKEN } from './oss.options.js'

@Injectable()
export class OssService {
  readonly client: Client
  readonly bucket: string

  constructor(@Inject(MODULE_OPTIONS_TOKEN) options: OssOptions) {
    this.bucket = options.bucket
    this.client = new Client(options.client)
  }

  put(key: string, content: Buffer | string | Readable, options: { size?: number, contentType?: string } = {}) {
    return this.client.putObject(this.bucket, key, content, options.size, {
      'Content-Type': options.contentType ?? 'application/octet-stream',
    })
  }

  get(key: string) {
    return this.client.getObject(this.bucket, key)
  }

  stat(key: string) {
    return this.client.statObject(this.bucket, key)
  }

  remove(key: string) {
    return this.client.removeObject(this.bucket, key)
  }

  presignDownload(key: string, expiresInSeconds = 300) {
    return this.client.presignedGetObject(this.bucket, key, expiresInSeconds)
  }

  presignUpload(key: string, expiresInSeconds = 300) {
    return this.client.presignedPutObject(this.bucket, key, expiresInSeconds)
  }
}
