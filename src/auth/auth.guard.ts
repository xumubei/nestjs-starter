import type { CanActivate, ExecutionContext } from '@nestjs/common'
import type { AuthenticatedRequest } from './types.js'
import { Injectable, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { AuthTokenService } from './auth-token.service.js'
import { PUBLIC_ROUTE } from './public.decorator.js'

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly tokens: AuthTokenService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [
      context.getHandler(),
      context.getClass(),
    ])) {
      return true
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
    const accountId = await this.tokens.accountFromBearer(request.headers.authorization)
    if (!accountId) {
      throw new UnauthorizedException('Valid bearer token required')
    }
    request.accountId = accountId
    return true
  }
}
