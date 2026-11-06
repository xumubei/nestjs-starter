// @env node
import { createHash } from 'node:crypto'

/** Matches PostgreSQL's unquoted ASCII identifier rules and length limit. */
export function quoteTable(name: string): string {
  if (!/^[a-z_][a-z\d_]{0,62}$/.test(name)) {
    throw new Error('Invalid PostgreSQL table name')
  }
  return `"${name}"`
}

/** Use a fixed shard count and create the physical tables via migrations. */
export function shardTable(base: string, key: string, shardCount: number): string {
  if (!Number.isSafeInteger(shardCount) || shardCount < 1 || shardCount > 0x100000000) {
    throw new RangeError('Invalid shard count')
  }
  const shard = createHash('sha256').update(key).digest().readUInt32BE() % shardCount
  return quoteTable(`${base}_${shard}`)
}
