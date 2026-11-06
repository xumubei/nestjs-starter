import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common'
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger'
import { ThrottlerGuard } from '@nestjs/throttler'
import { AccessTokenDto, CredentialsDto } from './auth.dto.js'
import { AuthService } from './auth.service.js'
import { Public } from './public.decorator.js'

@ApiTags('auth')
@Public()
@UseGuards(ThrottlerGuard)
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @ApiCreatedResponse({ type: AccessTokenDto })
  register(@Body() input: CredentialsDto): Promise<AccessTokenDto> {
    return this.auth.register(input)
  }

  @Post('login')
  @HttpCode(200)
  @ApiOkResponse({ type: AccessTokenDto })
  login(@Body() input: CredentialsDto): Promise<AccessTokenDto> {
    return this.auth.login(input)
  }
}
