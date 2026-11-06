import { ApiProperty } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsEmail, IsString, Length, MaxLength } from 'class-validator'

export class CredentialsDto {
  @ApiProperty({ format: 'email', example: 'demo@example.test' })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string'
    ? value.trim().toLowerCase()
    : value)
  @IsEmail()
  @MaxLength(254)
  email!: string

  @ApiProperty({
    format: 'password',
    minLength: 12,
    maxLength: 128,
    writeOnly: true,
  })
  @IsString()
  @Length(12, 128)
  password!: string
}

export class AccessTokenDto {
  @ApiProperty()
  accessToken!: string
}
