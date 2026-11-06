import type { FastifyRequest } from 'fastify'

export interface AuthenticatedRequest extends FastifyRequest {
  accountId: string
}
