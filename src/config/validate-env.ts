import type { AppConfig } from './types.js'
import { isHex256 } from '../modules/crypto/hex.js'

function parseTrustProxy(value: unknown): AppConfig['TRUST_PROXY'] {
  const text = String(value || 'false').trim()
  if (text === 'true' || text === 'false') {
    return text === 'true'
  }
  return /^\d+$/.test(text)
    ? Number(text)
    : text
}

export function validateEnv(env: Record<string, unknown>): AppConfig {
  const mode = env.NODE_ENV ?? 'development'
  if (mode !== 'development' && mode !== 'test' && mode !== 'production') {
    throw new Error('NODE_ENV must be development, test, or production')
  }

  const host = env.HOST ?? '127.0.0.1'
  if (typeof host !== 'string' || !host.trim()) {
    throw new Error('HOST must be a non-empty string')
  }

  const port = String(env.PORT ?? '3000')
  if (!/^\d{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535')
  }

  const swagger = env.SWAGGER_ENABLED ?? (mode === 'production'
    ? 'false'
    : 'true')
  if (swagger !== 'true' && swagger !== 'false') {
    throw new Error('SWAGGER_ENABLED must be true or false')
  }

  const databaseUrl = env.DATABASE_URL
  if (typeof databaseUrl !== 'string' || !/^postgres(?:ql)?:\/\//i.test(databaseUrl) || !URL.canParse(databaseUrl)) {
    throw new Error('DATABASE_URL must be a PostgreSQL connection URL')
  }

  const jwtSecret = env.JWT_SECRET
  if (!isHex256(jwtSecret)) {
    throw new Error('JWT_SECRET must be a 32-byte key encoded as 64 hex characters')
  }

  return {
    NODE_ENV: mode,
    HOST: host.trim(),
    PORT: Number(port),
    SWAGGER_ENABLED: swagger === 'true',
    TRUST_PROXY: parseTrustProxy(env.TRUST_PROXY),
    DATABASE_URL: databaseUrl,
    JWT_SECRET: jwtSecret,
  }
}
