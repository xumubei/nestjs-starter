export interface AppConfig {
  NODE_ENV: 'development' | 'test' | 'production'
  HOST: string
  PORT: number
  SWAGGER_ENABLED: boolean
  /** Passed to Fastify `trustProxy`: a boolean, a hop count, or comma-separated addresses and CIDRs. */
  TRUST_PROXY: boolean | number | string
  DATABASE_URL: string
  JWT_SECRET: string
}
