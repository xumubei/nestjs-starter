// @env node
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import type { Consumer, EachMessagePayload, Producer, ProducerRecord } from 'kafkajs'
import type { KafkaOptions } from './kafka.options.js'
import { setTimeout } from 'node:timers/promises'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { Kafka } from 'kafkajs'
import { MODULE_OPTIONS_TOKEN } from './kafka.options.js'

export interface KafkaSubscription {
  groupId: string
  topics: string[]
  fromBeginning?: boolean
  deadLetterTopic?: string
}

@Injectable()
export class KafkaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaService.name)
  private readonly kafka: Kafka
  private readonly producer: Producer
  private readonly consumers = new Set<Consumer>()
  private readonly maxAttempts: number
  private readonly backoffMs: number

  constructor(@Inject(MODULE_OPTIONS_TOKEN) { maxAttempts = 3, backoffMs = 1000, ...config }: KafkaOptions) {
    if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || !Number.isSafeInteger(backoffMs) || backoffMs < 0 || backoffMs > 5000) {
      throw new Error('Invalid Kafka retry settings')
    }
    this.maxAttempts = maxAttempts
    this.backoffMs = backoffMs
    this.kafka = new Kafka(config)
    this.producer = this.kafka.producer({ allowAutoTopicCreation: false })
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.producer.connect()
    }
    catch (error) {
      await this.producer.disconnect().catch(() => {})
      throw error
    }
  }

  publish(record: ProducerRecord) {
    return this.producer.send({ ...record, acks: -1 })
  }

  async subscribe(options: KafkaSubscription, handler: (message: EachMessagePayload) => Promise<void>): Promise<() => Promise<void>> {
    const { groupId, topics, fromBeginning, deadLetterTopic } = options
    if (deadLetterTopic && topics.includes(deadLetterTopic)) {
      throw new Error('Dead-letter topic cannot be a source topic')
    }
    const consumer = this.kafka.consumer({ groupId, allowAutoTopicCreation: false })
    this.consumers.add(consumer)
    const disconnect = async () => {
      if (this.consumers.delete(consumer)) {
        await consumer.disconnect()
      }
    }
    try {
      await consumer.connect()
      await consumer.subscribe({ topics, fromBeginning })
      await consumer.run({
        eachMessage: async (payload) => {
          const failure = await this.handle(payload, handler)
          if (!failure) {
            return
          }
          if (!deadLetterTopic) {
            throw failure.error
          }
          this.logger.warn(`Forwarding a failed message to ${deadLetterTopic}`, failure.error)
          await this.publish({
            topic: deadLetterTopic,
            messages: [
              {
                key: payload.message.key,
                value: payload.message.value,
                headers: {
                  ...payload.message.headers,
                  'source-topic': payload.topic,
                  'source-partition': String(payload.partition),
                  'source-offset': payload.message.offset,
                },
              },
            ],
          })
        },
      })
      return disconnect
    }
    catch (error) {
      await disconnect().catch(() => {})
      throw error
    }
  }

  async onModuleDestroy(): Promise<void> {
    const results = await Promise.allSettled([...this.consumers].map(consumer => consumer.disconnect()))
    this.consumers.clear()
    for (const result of results) {
      if (result.status === 'rejected') {
        this.logger.warn('Kafka consumer shutdown failed', result.reason)
      }
    }
    await this.producer.disconnect()
  }

  private async handle(payload: EachMessagePayload, handler: (message: EachMessagePayload) => Promise<void>): Promise<{ error: unknown } | undefined> {
    for (let attempt = 1; ; attempt++) {
      try {
        await handler(payload)
        return
      }
      catch (error) {
        if (attempt >= this.maxAttempts) {
          return { error }
        }
      }
      await payload.heartbeat()
      await setTimeout(this.backoffMs)
    }
  }
}
