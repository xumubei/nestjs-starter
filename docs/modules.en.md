# JSeed Module Guide

**English** | [简体中文](modules.md)

The NestJS starter covers the 16 [JSeed Java starters](https://github.com/xumubei/JSeed) by purpose. The example app wires in REST, PostgreSQL, JWT authentication, Swagger, and account-scoped tasks. Import the remaining modules where you use them.

| JSeed starter | NestJS entry point | Capabilities |
| --- | --- | --- |
| Core | `src/app.ts` and `src/config` | Environment validation, request IDs, and structured logs |
| Web | `src/app.ts` and `src/http` | Fastify REST, DTO validation, standard errors, security headers, and health checks |
| Swagger | `createApp()` | Swagger UI, OpenAPI JSON, and bearer authentication documentation |
| Sa-Token | `AuthModule` and `SessionModule` | JWT authentication and optional revocable Redis sessions |
| MyBatis | `DatabaseModule` | PostgreSQL pooling, migrations, bound parameters, transactions, pagination, and table shard routing |
| DataScope | `modules/datascope` | Owner scopes and SQL filtering by an application-provided set of authorized IDs |
| Crypto | `CryptoModule` | AES-256-GCM, SHA-256, HMAC, and scrypt password hashing |
| Job | `JobModule.forRoot()` | Cron, interval, and timeout jobs and the scheduler registry |
| Kafka | `KafkaModule` | Publishing, consumer groups, handler retries, and optional dead-letter topics |
| RabbitMQ | `RabbitMqModule` | Queue declaration, publisher confirms, manual acknowledgement, prefetch, retries, and dead lettering |
| MQTT | `MqttModule` | Publishing, wildcard subscriptions, unsubscribe, and subscription recovery after reconnect |
| Redis | `RedisModule` | Cache, TTLs, native commands, fixed-window rate limiting, and lease locks |
| Netty | `TcpModule` | Node.js TCP clients and servers, connection timeouts, and shutdown |
| WebSocket | `WebSocketModule` | Handshake authentication, text messages, unicast, and broadcast |
| OSS | `OssModule` | MinIO and S3-compatible uploads, streamed downloads, metadata, removal, and presigned URLs |
| TDengine | `TdengineModule` | SQL queries and execution over the official WebSocket connector |

Scheduling runs in each process. `waitForCompletion` prevents overlap in that process. TCP is a byte stream, so the application defines message framing. Redis sessions are separate credentials from the sample app's JWTs. Apply data scopes explicitly to reads, updates, and deletes.

## Start dependencies

Start only the local services that your application needs.

```sh
docker compose up -d redis mqtt kafka rabbitmq tdengine
```

See [the example environment](../.env.example) for connection addresses. For object storage, use an existing private bucket on MinIO or an S3-compatible server. Provision Kafka source and dead-letter topics before subscribing. Configure the RabbitMQ queue's dead-letter exchange and routing key to retain messages rejected after retries.

## Register a module

Use `register()` for direct options or `registerAsync()` to resolve options through Nest dependency injection. Add the registration to the feature module that injects the service. This example assumes the app has registered `ConfigModule` globally.

```ts
import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { MqttModule } from '../modules/mqtt/index.js'

@Module({
  imports: [
    MqttModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        url: config.getOrThrow<string>('MQTT_URL')
      }),
    }),
  ],
})
export class DevicesModule {}
```

| Registration | Example calls |
| --- | --- |
| `MqttModule.register({ url })` | `mqtt.subscribe('devices/+/status', handler)` and `mqtt.publish(topic, payload)` |
| `RedisModule.register({ url })` | `redis.set(key, value, ttlSeconds)`, `redis.allow(key, limit, windowMs)`, and `redis.tryLock(key, leaseMs, work)` |
| `SessionModule.register(RedisModule.register({ url }), { ttlSeconds: 3600 })` | `sessions.create(accountId)`, `sessions.resolve(token)`, and `sessions.revoke(token)` |
| `KafkaModule.register({ brokers })` | `kafka.publish({ topic, messages })` and `kafka.subscribe({ groupId, topics, deadLetterTopic }, handler)` |
| `RabbitMqModule.register({ url })` | `rabbit.declareQueue(queue)`, `rabbit.publish(queue, buffer)`, and `rabbit.subscribe(queue, handler)` |
| `OssModule.register({ bucket, client })` | `oss.put(key, buffer, { contentType })`, `oss.get(key)`, and `oss.presignDownload(key)`. The MinIO client options include `endPoint`, `port`, `useSSL`, `accessKey`, and `secretKey` |
| `TdengineModule.register({ url })` | `tdengine.execute(sql)` or `tdengine.query(sql)`. Iterate results with `next()` and `getData()`, then `close()` in `finally`. Use `client.stmtInit()` for parameter binding |
| `TcpModule` | `tcp.listen({ host, port }, onConnection)` and `tcp.connect({ host, port })` |
| `CryptoModule.register({ key })` | `crypto.encrypt(text)`, `crypto.decrypt(ciphertext)`, and `crypto.hashPassword(password)`. Generate a separate 32-byte key encoded as 64 hex characters |
| `JobModule.forRoot()` | Add an injectable job to `providers` and decorate a method with `@Cron(...)`, `@Interval(...)`, or `@Timeout(...)` |
| `DatabaseModule` | Use `db.transaction(async client => { … })` and pass bound values to the transaction client |

MQTT, Kafka, and RabbitMQ subscriptions return an asynchronous unsubscribe function. Kafka advances the offset after the handler succeeds or after the configured dead-letter publish succeeds. RabbitMQ acknowledges after a successful handler and rejects without requeueing after the last attempt. Restart the RabbitMQ application process after a lost broker connection. Message handlers should tolerate duplicate deliveries. Redis lock leases do not renew automatically, so finish the callback within the lease.

## Authenticate WebSocket upgrades

Register the module with an authentication callback. This example verifies the bearer token issued by the sample HTTP application.

```ts
WebSocketModule.registerAsync({
  imports: [AuthModule],
  inject: [AuthTokenService],
  useFactory: (tokens: AuthTokenService) => ({
    path: '/ws',
    authenticate: request => tokens.accountFromBearer(request.headers.authorization),
  }),
})
```

Import `AuthModule` and `AuthTokenService` from `src/auth`. On application bootstrap, inject `WebSocketService` and `HttpAdapterHost` and call `gateway.attach(adapterHost.httpAdapter.getHttpServer(), handler)`. A message contains `sessionId`, `principal`, and `payload`. Use `gateway.send(sessionId, payload)` to reply and `gateway.broadcast(payload)` for public updates. With cookie authentication, validate the request origin during the upgrade. Handle permission changes on already connected sessions in application code.

## Apply data scopes and table routing

Resolve scopes from an authenticated identity and pass the permitted IDs as SQL values. An empty array matches zero rows.

```ts
const departments = await allowedScopeIds(resolvePermissions, 'departments', request.accountId)
const result = await database.pool.query(
  'SELECT id, name FROM devices WHERE department_id = ANY($1)',
  [departments],
)
```

`shardTable('events', accountId, 16)` returns a quoted, validated table identifier. Choose a fixed shard count, create those tables in migrations, and continue to bind query values as parameters.

For setup, CI, and license information, see the [starter README](../README.md).
