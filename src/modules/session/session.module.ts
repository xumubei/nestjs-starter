import type { DynamicModule } from '@nestjs/common'
import type { SessionOptions } from './session.options.js'
import { Module } from '@nestjs/common'
import { SESSION_OPTIONS } from './session.options.js'
import { SessionService } from './session.service.js'

@Module({
  providers: [SessionService],
  exports: [SessionService],
})
export class SessionModule {
  static register(redis: DynamicModule, options: SessionOptions = {}): DynamicModule {
    return {
      module: SessionModule,
      imports: [redis],
      providers: [
        { provide: SESSION_OPTIONS, useValue: options },
      ],
    }
  }
}
