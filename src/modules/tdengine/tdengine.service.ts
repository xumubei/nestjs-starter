import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import type { WsSql } from '@tdengine/websocket'
import type { TdengineOptions } from './tdengine.options.js'
import { Inject, Injectable } from '@nestjs/common'
import { MODULE_OPTIONS_TOKEN } from './tdengine.options.js'

let driverUsers = 0

@Injectable()
export class TdengineService implements OnModuleInit, OnModuleDestroy {
  private connection?: WsSql
  private releaseDriver?: () => void

  constructor(@Inject(MODULE_OPTIONS_TOKEN) private readonly options: TdengineOptions) {}

  async onModuleInit(): Promise<void> {
    const { destroy, sqlConnect, WSConfig } = await import('@tdengine/websocket')
    driverUsers++
    this.releaseDriver = () => {
      // Closing a SQL session returns its socket to the SDK's process-wide pool.
      if (--driverUsers === 0) {
        destroy()
      }
    }
    try {
      const config = new WSConfig(this.options.url)
      config.setTimeOut(this.options.timeoutMs ?? 5000)
      this.connection = await sqlConnect(config)
    }
    catch {
      await this.onModuleDestroy()
      throw new Error('Could not connect to TDengine')
    }
  }

  get client(): WsSql {
    if (!this.connection) {
      throw new Error('TDengine is not connected')
    }
    return this.connection
  }

  query(sql: string) {
    return this.client.query(sql)
  }

  execute(sql: string) {
    return this.client.exec(sql)
  }

  async onModuleDestroy(): Promise<void> {
    const release = this.releaseDriver
    const connection = this.connection
    this.releaseDriver = undefined
    this.connection = undefined
    try {
      await connection?.close()
    }
    finally {
      release?.()
    }
  }
}
