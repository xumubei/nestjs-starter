export interface AppConfig {
  NODE_ENV: 'development' | 'test' | 'production'
  HOST: string
  PORT: number
  SWAGGER_ENABLED: boolean
  DATABASE_URL: string
  JWT_SECRET: string
}
