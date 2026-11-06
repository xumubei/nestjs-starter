// @env node
import type { AccessTokenDto, CredentialsDto } from './auth.dto.js'
import { randomUUID } from 'node:crypto'
import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { DatabaseService } from '../database/database.service.js'
import { hashPassword, verifyPassword } from './password.js'

@Injectable()
export class AuthService {
  constructor(
    private readonly database: DatabaseService,
    private readonly jwt: JwtService,
  ) {}

  async register(input: CredentialsDto): Promise<AccessTokenDto> {
    const id = randomUUID()
    const hash = await hashPassword(input.password)
    const result = await this.database.pool.query(
      'INSERT INTO accounts (id, email, password_hash) VALUES ($1, $2, $3) ON CONFLICT (email) DO NOTHING',
      [id, input.email, hash],
    )
    if (!result.rowCount) {
      throw new ConflictException('Email already registered')
    }
    return this.issueToken(id)
  }

  async login(input: CredentialsDto): Promise<AccessTokenDto> {
    const { rows: [account] } = await this.database.pool.query<{ id: string, password_hash: string }>(
      'SELECT id, password_hash FROM accounts WHERE email = $1',
      [input.email],
    )
    const matches = await verifyPassword(input.password, account?.password_hash)
    if (!account || !matches) {
      throw new UnauthorizedException('Invalid credentials')
    }
    return this.issueToken(account.id)
  }

  private async issueToken(id: string): Promise<AccessTokenDto> {
    return { accessToken: await this.jwt.signAsync({ sub: id }) }
  }
}
