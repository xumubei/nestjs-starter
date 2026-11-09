// @env node
import type { OnModuleDestroy } from '@nestjs/common'
import type { ListenOptions, TcpNetConnectOpts } from 'node:net'
import { once } from 'node:events'
import { createConnection, createServer } from 'node:net'
import { Injectable, Logger } from '@nestjs/common'

type TcpServer = ReturnType<typeof createServer>
type TcpSocket = ReturnType<typeof createConnection>

@Injectable()
export class TcpService implements OnModuleDestroy {
  private readonly logger = new Logger(TcpService.name)
  private readonly sockets = new Set<TcpSocket>()
  private readonly servers = new Set<TcpServer>()

  async listen(options: ListenOptions, onConnection: (socket: TcpSocket) => void): Promise<TcpServer> {
    const server = createServer((socket) => {
      this.track(socket)
      try {
        onConnection(socket)
      }
      catch (error) {
        this.logger.error('TCP connection handler failed', error)
        socket.destroy()
      }
    })
    server.on('error', error => this.logger.warn('TCP server error', error))
    this.servers.add(server)
    server.once('close', () => this.servers.delete(server))
    try {
      const listening = once(server, 'listening')
      server.listen({ host: '127.0.0.1', ...options })
      await listening
      return server
    }
    catch (error) {
      this.servers.delete(server)
      throw error
    }
  }

  async connect(options: TcpNetConnectOpts, timeoutMs = 5000): Promise<TcpSocket> {
    const signal = AbortSignal.timeout(timeoutMs)
    const socket = createConnection(options)
    this.track(socket)
    try {
      await once(socket, 'connect', { signal })
      return socket
    }
    catch (error) {
      socket.destroy()
      throw error
    }
  }

  async onModuleDestroy(): Promise<void> {
    const closing = [...this.servers].map(server => new Promise<void>(resolve => server.close(() => resolve())))
    for (const socket of this.sockets) {
      socket.destroy()
    }
    await Promise.all(closing)
  }

  private track(socket: TcpSocket): void {
    this.sockets.add(socket)
    socket.on('error', error => this.logger.warn('TCP socket error', error))
    socket.once('close', () => this.sockets.delete(socket))
  }
}
