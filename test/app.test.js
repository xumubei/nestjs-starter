// @env node
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import process from 'node:process'
import { after, before, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { runner } from 'node-pg-migrate'
import { Pool } from 'pg'
import { validateEnv } from '../dist/config/validate-env.js'
import { DatabaseService, quoteTable, shardTable } from '../dist/database/index.js'
import { allowedScopeIds } from '../dist/modules/datascope/index.js'

const databaseUrl = process.env.TEST_DATABASE_URL
const validEnv = {
  DATABASE_URL: 'postgresql://127.0.0.1/starter',
  JWT_SECRET: randomBytes(32).toString('hex'),
}

describe('REST API', () => {
  let app
  let pool
  const schema = `test_${randomUUID().replaceAll('-', '')}`

  before(async () => {
    Object.assign(process.env, validEnv, {
      NODE_ENV: 'test',
      HOST: '127.0.0.1',
      PORT: '3000',
      SWAGGER_ENABLED: 'true',
    })
    if (databaseUrl) {
      pool = new Pool({ connectionString: databaseUrl })
      await pool.query(`CREATE SCHEMA ${schema}`)
      const url = new URL(databaseUrl)
      url.searchParams.set('options', `-csearch_path=${schema}`)
      process.env.DATABASE_URL = url.href
    }
    const { createApp } = await import('../dist/app.js')
    app = await createApp()
    await app.init()
  })

  after(async () => {
    try {
      await app?.close()
    }
    finally {
      if (pool) {
        try {
          await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
        }
        finally {
          await pool.end()
        }
      }
    }
  })

  it('serves liveness and assigns its own request ID', async () => {
    const response = await app.inject({
      url: '/health',
      headers: { 'x-request-id': 'external' },
    })
    assert.equal(response.statusCode, 200)
    assert.deepEqual(response.json(), { status: 'ok' })
    assert.match(response.headers['x-request-id'], /^[\da-f-]{36}$/i)
  })

  it('protects tasks and validates public requests', async () => {
    assert.equal((await app.inject({ url: '/tasks' })).statusCode, 401)
    const invalidDto = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'bad', password: 'short', extra: true },
    })
    const malformedJson = await app.inject({
      method: 'POST',
      url: '/auth/register',
      headers: { 'content-type': 'application/json' },
      payload: '{',
    })
    for (const response of [invalidDto, malformedJson]) {
      assert.equal(response.statusCode, 400)
      assert.equal(response.json().requestId, response.headers['x-request-id'])
    }
    assert.ok(invalidDto.json().message.includes('property extra should not exist'))
  })

  it('documents task schemas and bearer authentication', async () => {
    assert.equal((await app.inject({ url: '/docs' })).statusCode, 200)
    const response = await app.inject({ url: '/docs-json' })
    assert.equal(response.statusCode, 200)
    const document = response.json()
    assert.deepEqual(document.paths['/tasks'].post.security, [
      { bearer: [] },
    ])
    assert.deepEqual(document.components.schemas.CreateTaskDto.required, ['title'])
  })

  it('rolls back PostgreSQL writes and treats an empty data scope as no access', { skip: !databaseUrl && 'Set TEST_DATABASE_URL' }, async () => {
    const database = app.get(DatabaseService)
    await database.pool.query('CREATE TABLE scoped_items (department_id int NOT NULL)')
    await assert.rejects(database.transaction(async (client) => {
      await client.query('INSERT INTO scoped_items VALUES ($1)', [1])
      throw new Error('abort')
    }), /abort/)
    assert.equal((await database.pool.query('SELECT * FROM scoped_items')).rowCount, 0)

    await database.transaction(async (client) => {
      await client.query('INSERT INTO scoped_items VALUES (1), (2)')
    })
    const scoped = ids => database.pool.query('SELECT * FROM scoped_items WHERE department_id = ANY($1)', [ids])
    const ids = await allowedScopeIds(() => [2], 'departments', 'user-a')
    assert.deepEqual((await scoped(ids)).rows, [
      { department_id: 2 },
    ])
    assert.deepEqual((await scoped([])).rows, [])
    await assert.rejects(allowedScopeIds(() => [1], 'departments', undefined), /Data scope/)
  })

  it('migrates PostgreSQL and isolates persisted tasks by account', { skip: !databaseUrl && 'Set TEST_DATABASE_URL' }, async () => {
    assert.equal((await app.inject({ url: '/health/ready' })).statusCode, 503)
    await runner({
      databaseUrl,
      dir: fileURLToPath(new URL('../migrations/', import.meta.url)),
      direction: 'up',
      migrationsTable: 'pgmigrations',
      schema,
      singleTransaction: true,
      log: () => {},
    })
    assert.equal((await app.inject({ url: '/health/ready' })).statusCode, 200)

    const password = 'correct-horse-example'
    async function credentials(action, email, inputPassword = password) {
      return app.inject({
        method: 'POST',
        url: `/auth/${action}`,
        payload: { email, password: inputPassword },
      })
    }
    assert.equal((await credentials('register', 'Owner@example.test')).statusCode, 201)
    assert.equal((await credentials('register', 'owner@example.test')).statusCode, 409)
    assert.equal((await credentials('login', 'owner@example.test', 'invalid-password')).statusCode, 401)
    const owner = await credentials('login', 'owner@example.test')
    const other = await credentials('register', 'other@example.test')
    assert.equal(owner.statusCode, 200)
    assert.equal(other.statusCode, 201)

    const ownerHeaders = { authorization: `Bearer ${owner.json().accessToken}` }
    const otherHeaders = { authorization: `Bearer ${other.json().accessToken}` }
    const created = await app.inject({
      method: 'POST',
      url: '/tasks',
      headers: ownerHeaders,
      payload: { title: '  First task  ' },
    })
    assert.equal(created.statusCode, 201)
    const task = created.json()
    assert.deepEqual(task, { id: task.id, title: 'First task', completed: false })
    const url = `/tasks/${task.id}`

    assert.deepEqual((await app.inject({ url: '/tasks', headers: otherHeaders })).json(), [])
    assert.deepEqual((await app.inject({ url: '/tasks?limit=1', headers: ownerHeaders })).json(), [task])
    assert.deepEqual((await app.inject({ url: '/tasks?offset=1', headers: ownerHeaders })).json(), [])
    assert.equal((await app.inject({ url: '/tasks?limit=101', headers: ownerHeaders })).statusCode, 400)
    for (const method of ['GET', 'PATCH', 'DELETE']) {
      const response = await app.inject({
        method,
        url,
        headers: otherHeaders,
        ...(method === 'PATCH'
          ? {
              payload: { completed: true },
            }
          : {}),
      })
      assert.equal(response.statusCode, 404)
    }

    assert.equal((await app.inject({
      method: 'PATCH',
      url,
      headers: ownerHeaders,
      payload: { completed: null },
    })).statusCode, 400)
    const updated = await app.inject({
      method: 'PATCH',
      url,
      headers: ownerHeaders,
      payload: { completed: true },
    })
    assert.equal(updated.statusCode, 200)
    assert.deepEqual(updated.json(), { ...task, completed: true })
    assert.deepEqual((await app.inject({ url, headers: ownerHeaders })).json(), updated.json())
    assert.equal((await app.inject({ method: 'DELETE', url, headers: ownerHeaders })).statusCode, 204)
    assert.equal((await app.inject({ url, headers: ownerHeaders })).statusCode, 404)
  })
})

describe('environment configuration', () => {
  it('validates infrastructure settings and defaults Swagger off in production', () => {
    assert.deepEqual(validateEnv(validEnv), {
      ...validEnv,
      NODE_ENV: 'development',
      HOST: '127.0.0.1',
      PORT: 3000,
      SWAGGER_ENABLED: true,
    })
    assert.equal(validateEnv({ ...validEnv, NODE_ENV: 'production' }).SWAGGER_ENABLED, false)
    assert.throws(() => validateEnv({ ...validEnv, PORT: '65536' }), /PORT must be/)
    assert.throws(() => validateEnv({ ...validEnv, JWT_SECRET: 'weak' }), /JWT_SECRET must be/)
    assert.throws(() => validateEnv({ ...validEnv, DATABASE_URL: 'https://example.test' }), /DATABASE_URL must be/)
  })
})

it('validates dynamic PostgreSQL table identifiers', () => {
  assert.equal(shardTable('events', 'account-a', 16), shardTable('events', 'account-a', 16))
  assert.match(shardTable('events', 'account-a', 16), /^"events_\d+"$/)
  assert.throws(() => quoteTable('tasks; DROP TABLE accounts'))
})
