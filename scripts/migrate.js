// @env node
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { runner } from 'node-pg-migrate'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  throw new Error('Set DATABASE_URL before running migrations')
}

runner({
  databaseUrl,
  dir: fileURLToPath(new URL('../migrations/', import.meta.url)),
  direction: 'up',
  migrationsTable: 'pgmigrations',
  singleTransaction: true,
}).catch((error) => {
  console.error(error)
  process.exitCode = 1
})
