// @env node
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import type { IClientPublishOptions, IClientSubscribeOptions, MqttClient } from 'mqtt'
import type { Buffer } from 'node:buffer'
import type { MqttOptions } from './mqtt.options.js'
import { clearTimeout, setTimeout } from 'node:timers'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { connect } from 'mqtt'
import { MODULE_OPTIONS_TOKEN } from './mqtt.options.js'

export type MqttHandler = (topic: string, payload: Buffer) => void | Promise<void>

function matches(filter: string, topic: string): boolean {
  const levels = filter.split('/')
  const parts = topic.split('/')
  if (topic.startsWith('$') && (levels[0] === '#' || levels[0] === '+')) {
    return false
  }

  for (const [index, level] of levels.entries()) {
    if (level === '#') {
      return true
    }
    if (index >= parts.length || (level !== '+' && level !== parts[index])) {
      return false
    }
  }
  return levels.length === parts.length
}

@Injectable()
export class MqttService implements OnModuleInit, OnModuleDestroy {
  private readonly client: MqttClient
  private readonly logger = new Logger(MqttService.name)
  private readonly handlers = new Map<string, MqttHandler>()
  private readonly connectTimeout: number
  private readonly reconnectPeriod: number

  constructor(@Inject(MODULE_OPTIONS_TOKEN) options: MqttOptions) {
    const url = URL.parse(options.url)
    if (!url?.hostname || !['mqtt:', 'mqtts:', 'ws:', 'wss:'].includes(url.protocol)) {
      throw new Error('Provide an MQTT broker URL using mqtt, mqtts, ws, or wss')
    }

    this.connectTimeout = options.clientOptions?.connectTimeout ?? 5000
    this.reconnectPeriod = options.clientOptions?.reconnectPeriod ?? 1000
    this.client = connect(options.url, {
      ...options.clientOptions,
      connectTimeout: this.connectTimeout,
      reconnectPeriod: 0,
      manualConnect: true,
      resubscribe: true,
      queueQoSZero: false,
    })
    this.client.on('error', error => this.logger.warn('MQTT client error', error))
    this.client.on('message', (topic, payload) => {
      for (const [filter, handler] of this.handlers) {
        if (matches(filter, topic)) {
          void Promise.resolve().then(() => handler(topic, payload)).catch((error: unknown) => {
            this.logger.error('MQTT message handler failed', error)
          })
        }
      }
    })
  }

  async onModuleInit(): Promise<void> {
    let cleanup = () => {}
    try {
      await new Promise<void>((resolve, reject) => {
        const connected = () => resolve()
        const timer = setTimeout(() => reject(new Error('Connection timed out')), this.connectTimeout)
        cleanup = () => {
          clearTimeout(timer)
          this.client.off('connect', connected)
          this.client.off('error', reject)
        }
        this.client.once('connect', connected)
        this.client.once('error', reject)
        this.client.connect()
      })
      this.client.options.reconnectPeriod = this.reconnectPeriod
    }
    catch (cause) {
      await this.client.endAsync(true)
      throw new Error('Could not connect to the MQTT broker', { cause })
    }
    finally {
      cleanup()
    }
  }

  async onModuleDestroy(): Promise<void> {
    // Prevent a pending socket close from scheduling a reconnect during shutdown.
    this.client.options.reconnectPeriod = 0
    await this.client.endAsync(true)
    this.handlers.clear()
  }

  async publish(topic: string, payload: string | Buffer, options: IClientPublishOptions = {}): Promise<void> {
    this.requireConnection()
    await this.client.publishAsync(topic, payload, { qos: 1, ...options })
  }

  async subscribe(filter: string, handler: MqttHandler, qos: IClientSubscribeOptions['qos'] = 1): Promise<() => Promise<void>> {
    this.requireConnection()
    if (!filter || filter.startsWith('$share/')) {
      throw new Error('Provide a non-shared MQTT topic filter')
    }
    if (this.handlers.has(filter)) {
      throw new Error('An MQTT handler is already registered for this filter')
    }

    // Retained messages may arrive before the subscription promise settles.
    this.handlers.set(filter, handler)
    try {
      await this.client.subscribeAsync(filter, { qos })
    }
    catch (error) {
      this.handlers.delete(filter)
      throw error
    }

    let removal: Promise<void> | undefined
    return () => removal ??= this.client.unsubscribeAsync(filter)
      .then(() => {
        this.handlers.delete(filter)
      })
      .catch((error: unknown) => {
        removal = undefined
        throw error
      })
  }

  private requireConnection(): void {
    if (!this.client.connected) {
      throw new Error('MQTT broker is not connected')
    }
  }
}
