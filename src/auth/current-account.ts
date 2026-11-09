import type { OwnerScope } from '../modules/datascope/index.js'
import { requestContext } from '@fastify/request-context'
import { ownerScope } from '../modules/datascope/index.js'

declare module '@fastify/request-context' {
  interface RequestContextData {
    accountId: string
  }
}

/** The account that AuthGuard verified for the current request, or undefined on public routes. */
export function currentAccountId(): string | undefined {
  return requestContext.get('accountId')
}

/** Scopes queries to the current account and throws 403 outside an authenticated request. */
export function currentOwner(): OwnerScope {
  return ownerScope(currentAccountId())
}
