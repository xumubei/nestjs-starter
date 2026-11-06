// @env node
import { Buffer } from 'node:buffer'
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const deriveKey = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number, r: number, p: number, maxmem: number },
) => Promise<Buffer>
const parameters = {
  N: 32768,
  r: 8,
  p: 3,
  maxmem: 64 * 1024 * 1024,
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const hash = await deriveKey(password, salt, 64, parameters)
  return `${salt.toString('hex')}:${hash.toString('hex')}`
}

export async function verifyPassword(password: string, storedHash?: string): Promise<boolean> {
  const [saltHex, hashHex] = storedHash?.split(':') ?? []
  // Derive a key even when the account does not exist.
  const salt = saltHex
    ? Buffer.from(saltHex, 'hex')
    : Buffer.alloc(16)
  const hash = await deriveKey(password, salt, 64, parameters)
  const expected = Buffer.from(hashHex ?? '', 'hex')
  return expected.length === hash.length && timingSafeEqual(expected, hash)
}
