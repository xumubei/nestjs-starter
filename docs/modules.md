# JSeed 模块对照与接入

[English](modules.en.md) | **简体中文**

NestJS 版按 [Java 版 JSeed](https://github.com/xumubei/JSeed) 的 16 个 Starter 提供对应能力。已有的 REST 示例用于演示认证、任务隔离、数据库和 Swagger。业务模块按需要导入其他能力。

| JSeed starter | NestJS 入口 | 能力 |
| --- | --- | --- |
| Core | `src/app.ts`、`src/config` | 环境配置校验、请求 ID 和结构化日志。基础 HTTP、JSON 和 UUID 使用 Node.js 原生 API |
| Web | `src/app.ts`、`src/http` | Fastify REST、DTO 校验、统一错误格式、安全响应头和健康检查 |
| Swagger | `createApp()` | `/docs`、`/docs-json`、Bearer 鉴权文档 |
| Sa-Token | `AuthModule`、`SessionModule` | JWT 登录和全局鉴权。也可按需用 Redis 管理有 TTL、可撤销的独立会话 |
| MyBatis | `DatabaseModule` | PostgreSQL 连接池、绑定参数、SQL 迁移、事务、分页示例和固定分表路由 |
| DataScope | `modules/datascope` | 按所有者隔离，以及用业务提供的授权 ID 集合做 SQL 过滤 |
| Crypto | `CryptoModule` | AES-256-GCM、SHA-256、HMAC 签名与验证、scrypt 密码哈希 |
| Job | `JobModule.forRoot()` | Cron、间隔、延时任务和调度注册表 |
| Kafka | `KafkaModule` | 生产、消费组、处理重试和可选死信主题 |
| RabbitMQ | `RabbitMqModule` | 队列声明、发布确认、手动确认、预取、失败重试和死信 |
| MQTT | `MqttModule` | 发布、通配符订阅、取消订阅、重连后恢复订阅 |
| Redis | `RedisModule` | 缓存、TTL、原生命令、固定窗口限流、带租约的锁 |
| Netty | `TcpModule` | Node.js TCP 服务端和客户端、连接超时与关闭 |
| WebSocket | `WebSocketModule` | 握手鉴权、文本消息、单发和广播 |
| OSS | `OssModule` | MinIO / S3 对象上传、流式下载、元数据、删除和预签名链接 |
| TDengine | `TdengineModule` | 官方 WebSocket 连接、SQL 查询和执行 |

Java 组件按用途对应。`JobModule` 在每个进程内调度，`waitForCompletion` 只防止同一进程重叠执行。`TcpModule` 提供字节流，业务自行定义消息边界。Redis 会话与默认 JWT 是独立凭据，撤销会话只影响用该会话校验的业务。`DataScope` 需要在查询和更新语句中显式应用范围。

## 启动依赖

按需启动开发服务，端口绑定到本机。

```sh
docker compose up -d redis mqtt kafka rabbitmq tdengine
```

各服务的连接地址在 [环境变量示例](../.env.example)。OSS 可连接已有的 MinIO 或 S3 兼容服务，使用已有私有 bucket 和最小权限凭据。Kafka 的来源主题和死信主题需要先创建，RabbitMQ 的死信队列和路由由队列配置决定。

## 注册模块

在 `src/integrations/example.module.ts` 中按需注册，再把该业务模块加入 `AppModule.imports`。配置使用 `register()` 直接传入，或者用 `registerAsync()` 注入 `ConfigService`。

```ts
import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { CryptoModule } from '../modules/crypto/index.js'
import { JobModule } from '../modules/job/index.js'
import { KafkaModule } from '../modules/kafka/index.js'
import { OssModule } from '../modules/oss/index.js'
import { RabbitMqModule } from '../modules/rabbitmq/index.js'
import { TcpModule } from '../modules/tcp/index.js'
import { TdengineModule } from '../modules/tdengine/index.js'

@Module({
  imports: [
    JobModule.forRoot(),
    TcpModule,
    CryptoModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        key: config.getOrThrow<string>('CRYPTO_KEY')
      }),
    }),
    KafkaModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        brokers: config.getOrThrow<string>('KAFKA_BROKERS').split(',').map(broker => broker.trim()),
      }),
    }),
    RabbitMqModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        url: config.getOrThrow<string>('RABBITMQ_URL')
      }),
    }),
    TdengineModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        url: config.getOrThrow<string>('TDENGINE_URL')
      }),
    }),
    OssModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const endpoint = new URL(config.getOrThrow<string>('OSS_URL'))
        return {
          bucket: config.getOrThrow<string>('OSS_BUCKET'),
          client: {
            endPoint: endpoint.hostname,
            port: Number(endpoint.port) || undefined,
            useSSL: endpoint.protocol === 'https:',
            accessKey: config.getOrThrow<string>('OSS_ACCESS_KEY'),
            secretKey: config.getOrThrow<string>('OSS_SECRET_KEY'),
          },
        }
      },
    }),
  ],
})
export class ExampleModule {}
```

`CRYPTO_KEY` 使用独立生成的 32 字节密钥，编码成 64 个十六进制字符。可以沿用 README 生成 JWT 密钥的命令，再运行一次生成独立密钥。

## 注入后的常用调用

| 注入的 Service | 使用示例 |
| --- | --- |
| `KafkaService` | `publish({ topic, messages: [{ key, value }] })`；`subscribe({ groupId, topics, deadLetterTopic }, handler)` |
| `RabbitMqService` | `declareQueue(queue)`；`publish(queue, Buffer.from(body))`；`subscribe(queue, handler)` |
| `OssService` | `put(key, buffer, { contentType })`；`get(key)` 返回流；`presignUpload(key)` / `presignDownload(key)` 返回短期链接 |
| `TdengineService` | `execute(sql)` 或 `query(sql)`，逐批调用结果的 `next()` / `getData()`，在 `finally` 中调用 `close()`；动态参数用原生 `client.stmtInit()` |
| `TcpService` | `listen({ host, port }, socket => { … })`；`connect({ host, port })` |
| `CryptoService` | `encrypt(text)`、`decrypt(ciphertext)`、`hashPassword(password)`、`verifyHmac(text, signature, secret)` |
| `DatabaseService` | `transaction(async client => { … })`。所有事务内操作使用回调提供的客户端 |

Kafka 和 RabbitMQ 的 `subscribe` 都返回异步取消订阅函数。Kafka 配了死信主题时，只有转发成功才允许推进该消息的位点。RabbitMQ 的发布要求 broker 确认并拒绝无路由消息，消费端处理成功后才确认，重试耗尽后拒绝且不重新入队。RabbitMQ 连接断开后由运行环境重启实例恢复消费。两者业务处理函数都应允许同一消息重复到达。

通过 `JobModule` 注册调度后，把任务类添加到业务模块的 `providers`。

```ts
import { Injectable } from '@nestjs/common'
import { Cron, CronExpression } from '../modules/job/index.js'

@Injectable()
export class CleanupJob {
  @Cron(CronExpression.EVERY_HOUR, { timeZone: 'Asia/Shanghai', waitForCompletion: true })
  async run() {
    // 调用业务服务，清理已过期的数据。
  }
}
```

## WebSocket 和 Redis 会话

使用现有 JWT 做握手鉴权时，将下面的动态模块放到业务模块的 `imports`。

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

`AuthTokenService` 由 `src/auth/auth.module.ts` 导出，类定义在 `src/auth/auth-token.service.ts`。在应用启动阶段，注入 `WebSocketService` 和 `HttpAdapterHost`，调用 `gateway.attach(adapterHost.httpAdapter.getHttpServer(), handler)`。`handler` 收到 `{ sessionId, principal, payload }`，可通过 `gateway.send(sessionId, payload)` 回复，或用 `gateway.broadcast(payload)` 发送公开消息。鉴权回调可由业务替换。浏览器使用 Cookie 时也应在回调中核验 `Origin`。连接建立后的权限变化由业务自行处理。

Redis 会话按下列方式注册，然后注入 `SessionService` 调用 `create(accountId)`、`resolve(token)`、`revoke(token)`。`RedisService` 提供 `allow(key, limit, windowMs)` 和 `tryLock(key, leaseMs, work)`。锁没有自动续约，回调应在租约内结束。

```ts
SessionModule.register(
  RedisModule.register({ url: 'redis://127.0.0.1:6380' }),
  { ttlSeconds: 3600 },
)
```

## 数据范围与分表

从已认证的身份解析范围。把允许的 ID 集合作为绑定参数，空集合匹配不到任何数据。读、更新和删除都应带上对应范围。

```ts
const departments = await allowedScopeIds(resolvePermissions, 'departments', request.accountId)
const result = await database.pool.query(
  'SELECT id, name FROM devices WHERE department_id = ANY($1)',
  [departments],
)
```

`shardTable('events', accountId, 16)` 返回经过校验的带引号表名。分表数量由业务预先确定，并通过迁移创建对应物理表。查询值继续使用 SQL 参数绑定。

## 参考

- [NestJS 调度](https://docs.nestjs.com/application/task-scheduling)
- [KafkaJS 消费](https://kafka.js.org/docs/consuming)
- [RabbitMQ 通道接口](https://amqp-node.github.io/amqplib/channel_api.html)
- [MinIO JavaScript SDK](https://docs.min.io/aistor/developers/sdk/javascript/api/)
- [TDengine Node.js 客户端](https://docs.tdengine.com/cloud/programming/client-libraries/node/)
