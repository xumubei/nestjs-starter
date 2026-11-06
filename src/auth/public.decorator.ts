import { SetMetadata } from '@nestjs/common'

export const PUBLIC_ROUTE = Symbol('publicRoute')
export const Public = () => SetMetadata(PUBLIC_ROUTE, true)
