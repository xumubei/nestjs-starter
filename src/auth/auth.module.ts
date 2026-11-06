// @env node
import type { AppConfig } from '../config/types.js'
import { Buffer } from 'node:buffer'
import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { JwtModule } from '@nestjs/jwt'
import { ThrottlerModule } from '@nestjs/throttler'
import { DatabaseModule } from '../database/database.module.js'
import { AuthTokenService } from './auth-token.service.js'
import { AuthController } from './auth.controller.js'
import { AuthGuard } from './auth.guard.js'
import { AuthService } from './auth.service.js'

const issuer = 'nestjs-starter'
const audience = 'nestjs-starter-api'

@Module({
  imports: [
    DatabaseModule,
    ThrottlerModule.forRoot([
      { ttl: 60_000, limit: 10 },
    ]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => ({
        secret: Buffer.from(config.get('JWT_SECRET', { infer: true }), 'hex'),
        signOptions: {
          algorithm: 'HS256',
          expiresIn: '15m',
          issuer,
          audience,
        },
        verifyOptions: {
          algorithms: ['HS256'],
          issuer,
          audience,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthTokenService,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [AuthTokenService],
})
export class AuthModule {}
