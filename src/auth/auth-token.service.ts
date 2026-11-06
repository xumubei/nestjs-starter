import { Injectable } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { isUUID } from 'class-validator'

@Injectable()
export class AuthTokenService {
  constructor(private readonly jwt: JwtService) {}

  async accountFromBearer(authorization?: string): Promise<string | null> {
    const token = /^Bearer (\S+)$/i.exec(authorization ?? '')?.[1]
    if (!token) {
      return null
    }
    const claims = await this.jwt.verifyAsync<{ sub?: unknown }>(token).catch(() => null)
    return typeof claims?.sub === 'string' && isUUID(claims.sub, '4')
      ? claims.sub
      : null
  }
}
