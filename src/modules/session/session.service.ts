// @env node
import type { SessionOptions } from './session.options.js'
import { createHash, randomBytes } from 'node:crypto'
import { Inject, Injectable } from '@nestjs/common'
import { RedisService } from '../redis/index.js'
import { MODULE_OPTIONS_TOKEN } from './session.options.js'

@Injectable()
export class SessionService {
  constructor(
    private readonly redis: RedisService,
    @Inject(MODULE_OPTIONS_TOKEN) private readonly options: SessionOptions,
  ) {}

  async create(accountId: string): Promise<string> {
    const token = randomBytes(32).toString('base64url')
    await this.redis.set(this.key(token), accountId, this.options.ttlSeconds ?? 3600)
    return token
  }

  async resolve(token: string): Promise<string | null> {
    return /^[\w-]{43}$/.test(token)
      ? this.redis.get(this.key(token))
      : null
  }

  async revoke(token: string): Promise<boolean> {
    return /^[\w-]{43}$/.test(token) && this.redis.delete(this.key(token))
  }

  private key(token: string): string {
    const hash = createHash('sha256').update(token).digest('hex')
    return `${this.options.prefix ?? 'starter:session:'}${hash}`
  }
}
