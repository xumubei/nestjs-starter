export interface SessionOptions {
  prefix?: string
  ttlSeconds?: number
}

export const SESSION_OPTIONS = Symbol('SessionOptions')
