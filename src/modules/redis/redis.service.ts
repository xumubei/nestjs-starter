// @env node
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import type { RedisClientType } from '@redis/client'
import type { RedisOptions } from './redis.options.js'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { createClient } from '@redis/client'
import { MODULE_OPTIONS_TOKEN } from './redis.options.js'

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  readonly client: RedisClientType
  private readonly logger = new Logger(RedisService.name)
  private readonly connectTimeout: number

  constructor(@Inject(MODULE_OPTIONS_TOKEN) options: RedisOptions) {
    const url = URL.parse(options.url)
    if (!url?.hostname || !['redis:', 'rediss:'].includes(url.protocol)) {
      throw new Error('Provide a Redis connection URL using redis or rediss')
    }

    this.connectTimeout = options.connectTimeoutMs ?? 5000
    this.client = createClient({
      url: options.url,
      socket: { connectTimeout: this.connectTimeout },
      disableOfflineQueue: true,
    })

    this.client.on('error', (error: Error) => this.logger.warn('Redis client error', error))
  }

  async onModuleInit(): Promise<void> {
    try {
      // connect() keeps retrying an unreachable server, so the ready event enforces the timeout.
      await Promise.all([
        once(this.client, 'ready', {
          signal: AbortSignal.timeout(this.connectTimeout),
        }),
        this.client.connect(),
      ])
    }
    catch (cause) {
      this.onModuleDestroy()
      throw new Error('Could not connect to Redis', { cause })
    }
  }

  onModuleDestroy(): void {
    if (this.client.isOpen) {
      this.client.destroy()
    }
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key)
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds !== undefined && (!Number.isSafeInteger(ttlSeconds) || ttlSeconds <= 0)) {
      throw new RangeError('Redis TTL must be a positive integer in seconds')
    }

    await this.client.set(key, value, ttlSeconds === undefined
      ? undefined
      : {
          expiration: { type: 'EX', value: ttlSeconds },
        })
  }

  /** The callback must finish within the lease. Use a fencing token for stale-writer protection. */
  async tryLock<T>(key: string, leaseMs: number, work: () => Promise<T>): Promise<{ acquired: false } | { acquired: true, value: T }> {
    if (!Number.isSafeInteger(leaseMs) || leaseMs < 1) {
      throw new RangeError('Redis lease must be a positive integer in milliseconds')
    }
    const lockKey = `starter:lock:${key}`
    const token = randomUUID()
    const acquired = await this.client.set(lockKey, token, {
      condition: 'NX',
      expiration: { type: 'PX', value: leaseMs },
    })
    if (acquired !== 'OK') {
      return { acquired: false }
    }

    try {
      return { acquired: true, value: await work() }
    }
    finally {
      await this.client.eval(
        'if redis.call(\'GET\', KEYS[1]) == ARGV[1] then return redis.call(\'DEL\', KEYS[1]) end return 0',
        {
          keys: [lockKey],
          arguments: [token],
        },
      ).catch((error: unknown) => this.logger.warn('Redis lock release failed', error))
    }
  }

  async allow(key: string, limit: number, windowMs: number): Promise<boolean> {
    if (!Number.isSafeInteger(limit) || limit < 1 || !Number.isSafeInteger(windowMs) || windowMs < 1) {
      throw new RangeError('Redis rate limit and window must be positive integers')
    }
    const count = await this.client.eval(
      'local count = redis.call(\'INCR\', KEYS[1]); if count == 1 then redis.call(\'PEXPIRE\', KEYS[1], ARGV[1]) end; return count',
      {
        keys: [`starter:rate:${key}`],
        arguments: [
          String(windowMs),
        ],
      },
    )
    return typeof count === 'number' && count <= limit
  }

  async delete(key: string): Promise<boolean> {
    return (await this.client.del(key)) > 0
  }
}
