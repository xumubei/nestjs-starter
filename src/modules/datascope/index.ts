import { ForbiddenException } from '@nestjs/common'

export interface OwnerScope {
  readonly ownerId: string
}

/** Build the scope from authenticated identity or a trusted authorization resolver. */
export function ownerScope(ownerId: string | undefined): OwnerScope {
  if (!ownerId) {
    throw new ForbiddenException('Data scope is required')
  }
  return { ownerId }
}

export type ScopeId = string | number
export type DataScopeResolver = (key: string, principal: string) => readonly ScopeId[] | Promise<readonly ScopeId[]>

/** Use the result as a bound SQL array, e.g. WHERE department_id = ANY($1). */
export async function allowedScopeIds(resolver: DataScopeResolver, key: string, principal: string | undefined): Promise<ScopeId[]> {
  if (!principal) {
    throw new ForbiddenException('Data scope is required')
  }
  return [
    ...await resolver(key, principal),
  ]
}
