// @env node
import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { EventEmitter, once } from 'node:events'
import { createServer } from 'node:net'
import process from 'node:process'
import { it } from 'node:test'
import { Module } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter } from '@nestjs/platform-fastify'
import { Aedes } from 'aedes'
import { WebSocket } from 'ws'
import { CryptoModule, CryptoService } from '../dist/modules/crypto/index.js'
import { MqttModule, MqttService } from '../dist/modules/mqtt/index.js'
import { RedisModule, RedisService } from '../dist/modules/redis/index.js'
import { SessionModule, SessionService } from '../dist/modules/session/index.js'
import { TcpModule, TcpService } from '../dist/modules/tcp/index.js'
import { WebSocketModule, WebSocketService } from '../dist/modules/websocket/index.js'

async function createContext(...imports) {
  class TestModule {}
  Module({ imports })(TestModule)
  return NestFactory.createApplicationContext(TestModule, { logger: false, abortOnError: false })
}

async function listen(t, handler) {
  const server = createServer(handler)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => new Promise(resolve => server.close(resolve)))
  return server.address().port
}

it('MQTT dispatches wildcard subscriptions, restores them after reconnect, and unsubscribes', { timeout: 8000 }, async (t) => {
  const broker = await Aedes.createBroker()
  t.after(() => new Promise(resolve => broker.close(resolve)))
  const port = await listen(t, broker.handle)
  const app = await createContext(MqttModule.registerAsync({
    useFactory: () => ({
      url: `mqtt://127.0.0.1:${port}`,
      clientOptions: { clientId: 'starter-test', reconnectPeriod: 50 },
    }),
  }))
  t.after(() => app.close())
  const mqtt = app.get(MqttService)
  const messages = new EventEmitter()
  const unsubscribe = await mqtt.subscribe('devices/+/events/#', (topic, payload) => {
    messages.emit('message', topic, payload.toString())
  })
  await assert.rejects(mqtt.subscribe('devices/+/events/#', () => {}), /already registered/)
  const topic = 'devices/a/events'
  const received = once(messages, 'message', {
    signal: AbortSignal.timeout(2000),
  })
  await mqtt.publish(topic, 'online')
  assert.deepEqual(await received, [topic, 'online'])

  const resubscribed = once(broker, 'subscribe', {
    signal: AbortSignal.timeout(2000),
  })
  await new Promise(resolve => broker.clients['starter-test'].close(resolve))
  await resubscribed
  const afterReconnect = once(messages, 'message', {
    signal: AbortSignal.timeout(2000),
  })
  await mqtt.publish(topic, 'reconnected')
  assert.deepEqual(await afterReconnect, [topic, 'reconnected'])

  await Promise.all([
    unsubscribe(),
    unsubscribe(),
  ])
  const unexpected = []
  messages.on('message', (...args) => unexpected.push(args))
  const reference = once(messages, 'reference', {
    signal: AbortSignal.timeout(2000),
  })
  await mqtt.subscribe(topic, () => {
    messages.emit('reference')
  })
  await mqtt.publish(topic, 'offline')
  await reference
  assert.deepEqual(unexpected, [])
})

it('MQTT startup fails when the TCP peer does not complete the handshake', { timeout: 3000 }, async (t) => {
  const port = await listen(t, socket => socket.resume())
  await assert.rejects(createContext(MqttModule.register({
    url: `mqtt://127.0.0.1:${port}`,
    clientOptions: { connectTimeout: 150 },
  })), /Could not connect to the MQTT broker/)
})

const redisUrl = process.env.TEST_REDIS_URL
it('Redis shares a client, preserves TTL, and closes the connection', { skip: !redisUrl && 'Set TEST_REDIS_URL', timeout: 8000 }, async () => {
  const app = await createContext(RedisModule.register({ url: redisUrl }))
  const redis = app.get(RedisService)
  const key = `nestjs-starter:test:${randomUUID()}`
  try {
    assert.equal(await redis.get(key), null)
    await redis.set(key, 'cached', 60)
    assert.equal(await redis.get(key), 'cached')
    assert.ok((await redis.client.ttl(key)) > 0)
    await assert.rejects(redis.set(key, 'invalid', 0), RangeError)
    assert.equal(await redis.delete(key), true)
    assert.equal(await redis.delete(key), false)
  }
  finally {
    try {
      await redis.delete(key)
    }
    finally {
      await app.close()
    }
  }
  assert.equal(redis.client.isOpen, false)
})

it('Redis startup fails when the TCP peer does not complete the handshake', { timeout: 3000 }, async (t) => {
  const port = await listen(t, socket => socket.resume())
  await assert.rejects(createContext(RedisModule.registerAsync({
    useFactory: () => ({ url: `redis://127.0.0.1:${port}`, connectTimeoutMs: 150 }),
  })), /Could not connect to Redis/)
})

it('Crypto authenticates ciphertext and rejects tampering', async (t) => {
  const app = await createContext(CryptoModule.register({
    key: 'ef'.repeat(32),
  }))
  t.after(() => app.close())
  const crypto = app.get(CryptoService)
  const ciphertext = crypto.encrypt('测试')
  assert.equal(crypto.decrypt(ciphertext), '测试')
  assert.notEqual(crypto.encrypt('测试'), ciphertext)
  const modified = Buffer.from(ciphertext, 'base64url')
  modified[12] ^= 1
  assert.throws(() => crypto.decrypt(modified.toString('base64url')))
  const mac = crypto.hmacSha256('body', 'shared-secret')
  assert.equal(crypto.verifyHmac('body', mac, 'shared-secret'), true)
  assert.equal(crypto.verifyHmac('changed', mac, 'shared-secret'), false)
})

it('TCP accepts data and closes open sockets with the module', { timeout: 4000 }, async (t) => {
  const app = await createContext(TcpModule)
  t.after(() => app.close())
  const tcp = app.get(TcpService)
  const server = await tcp.listen({ port: 0 }, (socket) => {
    socket.pipe(socket)
  })
  const client = await tcp.connect({ host: '127.0.0.1', port: server.address().port })
  const received = once(client, 'data', {
    signal: AbortSignal.timeout(2000),
  })
  client.write('ping')
  assert.equal((await received)[0].toString(), 'ping')
  const closed = once(client, 'close')
  await tcp.onModuleDestroy()
  await closed
  assert.equal(server.listening, false)
})

it('WebSocket rejects unauthenticated upgrades and supports unicast and broadcast', { timeout: 5000 }, async (t) => {
  class WsTestModule {}
  Module({
    imports: [
      WebSocketModule.register({
        authenticate: request => request.headers.authorization === 'Bearer test-token'
          ? 'account-a'
          : null,
      }),
    ],
  })(WsTestModule)
  const app = await NestFactory.create(WsTestModule, new FastifyAdapter(), { logger: false, abortOnError: false })
  const gateway = app.get(WebSocketService)
  const server = app.getHttpServer()
  t.after(() => app.close())
  gateway.attach(server, ({ sessionId, principal, payload }) => {
    gateway.send(sessionId, `${principal}:${payload}`)
  })
  await app.listen(0, '127.0.0.1')
  const url = `ws://127.0.0.1:${server.address().port}/ws`
  const rejected = new WebSocket(url)
  const [error] = await once(rejected, 'error')
  assert.match(error.message, /401/)
  const wrongPath = new WebSocket(`${url}/unknown`)
  assert.match((await once(wrongPath, 'error'))[0].message, /socket hang up/)
  const client = new WebSocket(url, {
    headers: { authorization: 'Bearer test-token' },
  })
  await once(client, 'open')
  assert.equal(gateway.sessionCount, 1)
  const reply = once(client, 'message')
  client.send('ping')
  assert.equal((await reply)[0].toString(), 'account-a:ping')
  const broadcast = once(client, 'message')
  assert.equal(gateway.broadcast('update'), 1)
  assert.equal((await broadcast)[0].toString(), 'update')
})

it('Redis coordinates locks, rate limits and revocable sessions', { skip: !redisUrl && 'Set TEST_REDIS_URL', timeout: 8000 }, async (t) => {
  const app = await createContext(
    RedisModule.register({ url: redisUrl, isGlobal: true }),
    SessionModule.register({}),
  )
  t.after(() => app.close())
  const sessions = app.get(SessionService)
  const redis = app.get(RedisService)
  const key = randomUUID()
  assert.deepEqual(await redis.tryLock(key, 5000, async () => {
    assert.deepEqual(await redis.tryLock(key, 5000, async () => 0), { acquired: false })
    return 42
  }), { acquired: true, value: 42 })
  assert.equal((await redis.tryLock(key, 5000, async () => 1)).acquired, true)

  const allowed = await Promise.all(Array.from({ length: 8 }, () => redis.allow(key, 3, 5000)))
  assert.equal(allowed.filter(Boolean).length, 3)
  await redis.delete(`starter:rate:${key}`)

  const token = await sessions.create('account-a')
  assert.equal(await sessions.resolve(token), 'account-a')
  assert.equal(await sessions.revoke(token), true)
  assert.equal(await sessions.resolve(token), null)
})
