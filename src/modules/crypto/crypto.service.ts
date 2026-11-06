// @env node
import type { CryptoOptions } from './crypto.options.js'
import { Buffer } from 'node:buffer'
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { Inject, Injectable } from '@nestjs/common'
import { hashPassword, verifyPassword } from '../../auth/password.js'
import { MODULE_OPTIONS_TOKEN } from './crypto.options.js'

@Injectable()
export class CryptoService {
  private readonly key: Buffer

  constructor(@Inject(MODULE_OPTIONS_TOKEN) options: CryptoOptions) {
    if (!/^[\da-f]{64}$/i.test(options.key)) {
      throw new Error('Crypto key must contain 64 hexadecimal characters')
    }
    this.key = Buffer.from(options.key, 'hex')
  }

  encrypt(plaintext: string): string {
    const nonce = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', this.key, nonce)
    const body = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ])
    return Buffer.concat([
      nonce,
      cipher.getAuthTag(),
      body,
    ]).toString('base64url')
  }

  decrypt(ciphertext: string): string {
    const input = Buffer.from(ciphertext, 'base64url')
    if (input.length < 28 || input.toString('base64url') !== ciphertext) {
      throw new Error('Invalid ciphertext')
    }
    const decipher = createDecipheriv('aes-256-gcm', this.key, input.subarray(0, 12))
    decipher.setAuthTag(input.subarray(12, 28))
    return Buffer.concat([
      decipher.update(input.subarray(28)),
      decipher.final(),
    ]).toString('utf8')
  }

  sha256(text: string): string {
    return createHash('sha256').update(text).digest('hex')
  }

  hmacSha256(text: string, secret: string | Buffer): string {
    return createHmac('sha256', secret).update(text).digest('hex')
  }

  verifyHmac(text: string, signature: string, secret: string | Buffer): boolean {
    return /^[\da-f]{64}$/i.test(signature)
      && timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(this.hmacSha256(text, secret), 'hex'))
  }

  readonly hashPassword = hashPassword
  readonly verifyPassword = verifyPassword
}
