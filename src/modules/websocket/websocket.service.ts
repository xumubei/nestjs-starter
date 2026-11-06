import type { OnModuleDestroy } from '@nestjs/common'
// @env node
import type { Buffer } from 'node:buffer'
import type { IncomingMessage, Server } from 'node:http'
import type { Duplex } from 'node:stream'
import type { WebSocketOptions } from './websocket.options.js'
import { randomUUID } from 'node:crypto'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { WebSocket, WebSocketServer } from 'ws'
import { MODULE_OPTIONS_TOKEN } from './websocket.options.js'

export interface WebSocketMessage {
  sessionId: string
  principal: string
  payload: string
}

@Injectable()
export class WebSocketService implements OnModuleDestroy {
  private readonly logger = new Logger(WebSocketService.name)
  private readonly gateway = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 })
  private readonly sessions = new Map<string, WebSocket>()
  private readonly pending = new Set<Duplex>()
  private server?: Server
  private handler?: (message: WebSocketMessage) => void | Promise<void>

  constructor(@Inject(MODULE_OPTIONS_TOKEN) private readonly options: WebSocketOptions) {}

  attach(server: Server, onMessage: (message: WebSocketMessage) => void | Promise<void>): void {
    if (this.server) {
      throw new Error('WebSocketService is already attached')
    }
    if (server.listenerCount('upgrade') > 0) {
      throw new Error('WebSocketService requires control of HTTP upgrades')
    }
    this.server = server
    this.handler = onMessage
    server.on('upgrade', this.upgrade)
  }

  get sessionCount(): number {
    return this.sessions.size
  }

  send(sessionId: string, payload: string): boolean {
    const socket = this.sessions.get(sessionId)
    if (!socket || socket.readyState !== WebSocket.OPEN || socket.bufferedAmount >= 1024 * 1024) {
      return false
    }
    socket.send(payload)
    return true
  }

  broadcast(payload: string): number {
    let sent = 0
    for (const sessionId of this.sessions.keys()) {
      if (this.send(sessionId, payload)) {
        sent++
      }
    }
    return sent
  }

  async onModuleDestroy(): Promise<void> {
    this.server?.off('upgrade', this.upgrade)
    for (const socket of this.pending) {
      socket.destroy()
    }
    for (const socket of this.sessions.values()) {
      socket.terminate()
    }
    await new Promise<void>(resolve => this.gateway.close(() => resolve()))
  }

  private readonly upgrade = (request: IncomingMessage, socket: Duplex, head: Buffer): void => {
    if (request.url?.split('?')[0] !== (this.options.path ?? '/ws')) {
      socket.destroy()
      return
    }

    this.pending.add(socket)
    const timer = setTimeout(() => socket.destroy(), 5000)
    const onError = () => socket.destroy()
    const cleanup = () => {
      clearTimeout(timer)
      this.pending.delete(socket)
      socket.off('close', cleanup)
      socket.off('error', onError)
    }
    socket.on('error', onError)
    socket.once('close', cleanup)
    void Promise.resolve().then(() => this.options.authenticate(request)).then((principal) => {
      if (socket.destroyed) {
        return
      }
      if (!principal) {
        socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\nContent-Length: 0\r\n\r\n')
        return
      }
      this.gateway.handleUpgrade(request, socket, head, (client) => {
        this.accept(client, principal)
      })
    }).catch(() => {
      socket.destroy()
    }).finally(() => {
      if (!socket.writableEnded) {
        cleanup()
      }
    })
  }

  private accept(socket: WebSocket, principal: string): void {
    const sessionId = randomUUID()
    this.sessions.set(sessionId, socket)
    socket.on('error', () => socket.terminate())
    socket.once('close', () => this.sessions.delete(sessionId))
    socket.on('message', (data, isBinary) => {
      if (isBinary) {
        socket.close(1003, 'Text messages only')
        return
      }
      void Promise.resolve().then(() => this.handler?.({
        sessionId,
        principal,
        payload: data.toString(),
      })).catch(() => {
        this.logger.error('WebSocket message handler failed')
      })
    })
  }
}
