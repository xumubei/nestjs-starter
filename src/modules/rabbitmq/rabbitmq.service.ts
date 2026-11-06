import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import type { Channel, ChannelModel, ConfirmChannel, ConsumeMessage, Options } from 'amqplib'
// @env node
import type { Buffer } from 'node:buffer'
import type { RabbitMqOptions } from './rabbitmq.options.js'
import { randomUUID } from 'node:crypto'
import { setTimeout } from 'node:timers/promises'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { connect } from 'amqplib'
import { MODULE_OPTIONS_TOKEN } from './rabbitmq.options.js'

@Injectable()
export class RabbitMqService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMqService.name)
  private readonly prefetch: number
  private readonly maxAttempts: number
  private connection?: ChannelModel
  private publisher?: ConfirmChannel
  private readonly unconfirmed = new Map<string, { returned: boolean }>()

  constructor(@Inject(MODULE_OPTIONS_TOKEN) private readonly options: RabbitMqOptions) {
    this.prefetch = options.prefetch ?? 20
    this.maxAttempts = options.maxAttempts ?? 3
    if (!Number.isInteger(this.prefetch) || this.prefetch < 1 || this.prefetch > 65535
      || !Number.isSafeInteger(this.maxAttempts) || this.maxAttempts < 1) {
      throw new Error('Invalid RabbitMQ consumer settings')
    }
  }

  async onModuleInit(): Promise<void> {
    const connection = await connect(this.options.url, { timeout: 5000 })
    this.connection = connection
    connection.on('error', () => this.logger.warn('RabbitMQ connection error'))
    connection.once('close', () => {
      this.connection = undefined
      this.publisher = undefined
    })
    try {
      this.publisher = await connection.createConfirmChannel()
      this.publisher.on('error', () => this.logger.warn('RabbitMQ publisher error'))
      this.publisher.once('close', () => {
        this.publisher = undefined
      })
      this.publisher.on('return', (message: ConsumeMessage) => {
        const id = message.properties.headers?.['x-jseed-publish-id']
        const pending = typeof id === 'string'
          ? this.unconfirmed.get(id)
          : undefined
        if (pending) {
          pending.returned = true
        }
      })
    }
    catch (error) {
      await connection.close().catch(() => {})
      throw error
    }
  }

  declareQueue(queue: string, options: Options.AssertQueue = {}) {
    return this.getPublisher().assertQueue(queue, { durable: true, ...options })
  }

  async publish(queue: string, payload: Buffer, options: Options.Publish = {}): Promise<void> {
    const publisher = this.getPublisher()
    if (this.unconfirmed.size >= 1024) {
      throw new Error('RabbitMQ publisher has too many pending confirmations')
    }
    const id = randomUUID()
    const pending = { returned: false }
    this.unconfirmed.set(id, pending)
    try {
      await new Promise<void>((resolve, reject) => {
        publisher.sendToQueue(queue, payload, {
          persistent: true,
          ...options,
          mandatory: true,
          headers: { ...options.headers, 'x-jseed-publish-id': id },
        }, (error) => {
          if (error) {
            reject(error)
          }
          else if (pending.returned) {
            reject(new Error('RabbitMQ message was unroutable'))
          }
          else {
            resolve()
          }
        })
      })
    }
    finally {
      this.unconfirmed.delete(id)
    }
  }

  async subscribe(queue: string, handler: (message: ConsumeMessage) => Promise<void>): Promise<() => Promise<void>> {
    if (!this.connection) {
      throw new Error('RabbitMQ is not connected')
    }
    const channel = await this.connection.createChannel()
    const stop = new AbortController()
    channel.on('error', () => this.logger.warn('RabbitMQ consumer error'))
    channel.once('close', () => stop.abort())
    try {
      await channel.prefetch(this.prefetch)
      const { consumerTag } = await channel.consume(queue, (message) => {
        if (!message) {
          this.logger.warn('RabbitMQ consumer was cancelled by the broker')
          return
        }
        void this.consume(channel, message, handler, stop.signal).catch(() => {
          if (!stop.signal.aborted) {
            this.logger.error('Could not acknowledge RabbitMQ message')
          }
        })
      })
      return async () => {
        if (!stop.signal.aborted) {
          try {
            await channel.cancel(consumerTag)
          }
          finally {
            if (!stop.signal.aborted) {
              await channel.close()
            }
          }
        }
      }
    }
    catch (error) {
      await channel.close().catch(() => {})
      throw error
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.connection?.close()
  }

  private getPublisher(): ConfirmChannel {
    if (!this.publisher) {
      throw new Error('RabbitMQ publisher is not connected')
    }
    return this.publisher
  }

  private async consume(channel: Channel, message: ConsumeMessage, handler: (message: ConsumeMessage) => Promise<void>, signal: AbortSignal): Promise<void> {
    for (let attempt = 1; !signal.aborted; attempt++) {
      try {
        await handler(message)
      }
      catch {
        if (signal.aborted) {
          return
        }
        if (attempt >= this.maxAttempts) {
          channel.nack(message, false, false)
          return
        }
        await setTimeout(Math.min(1000 * 2 ** (attempt - 1), 10_000), undefined, { signal })
        continue
      }
      if (!signal.aborted) {
        channel.ack(message)
      }
      return
    }
  }
}
