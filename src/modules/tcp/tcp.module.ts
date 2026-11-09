import { Module } from '@nestjs/common'
import { TcpService } from './tcp.service.js'

@Module({
  providers: [TcpService],
  exports: [TcpService],
})
export class TcpModule {}
