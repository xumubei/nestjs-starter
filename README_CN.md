# NestJS 脚手架

[English](README.md) | **简体中文**

基于 NestJS、Fastify 和 TypeScript 的 REST API 脚手架。内置 PostgreSQL 迁移、JWT 登录、Swagger 和按账号隔离的任务 CRUD。可按需导入 MQTT、Redis、Kafka、RabbitMQ、WebSocket、TCP、对象存储、定时任务、加密和 TDengine 等模块。参见 [JSeed 模块对照与接入示例](docs/modules.md)。

## 本地启动

需要 Node.js 24 或更高版本、pnpm 11 和 PostgreSQL。可以用 Docker Compose 启动本地数据库。

```sh
pnpm install --frozen-lockfile
cp .env.example .env
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

把生成的值填入 `.env` 的 `JWT_SECRET`，然后启动数据库、运行迁移和开发服务。如果已有 PostgreSQL，设置 `DATABASE_URL` 后可以直接运行迁移。

```sh
docker compose up -d --wait postgres
pnpm run db:migrate
pnpm dev
```

打开 `http://127.0.0.1:3000/docs`，先用 `POST /auth/register` 注册或 `POST /auth/login` 登录，复制 `accessToken` 到 Swagger 的 **Authorize**，就可以调用 `/tasks`。列表支持 `limit` 和 `offset` 分页。

| 路径 | 用途 |
| --- | --- |
| `GET /health` | 检查应用进程 |
| `GET /health/ready` | 检查 PostgreSQL 和任务表 |
| `GET /docs` | Swagger UI，开发和测试环境默认开启 |
| `GET /docs-json` | OpenAPI 文档 |

错误响应包含 `statusCode`、`message` 和 `requestId`，请求 ID 也会通过 `X-Request-Id` 响应头返回。

## 按需导入 Redis 和 MQTT

可在本地启动这两个服务。端口只绑定在本机，Compose 配置用于开发联调。

```sh
docker compose up -d redis mqtt
```

在 `.env` 填写连接地址。

```dotenv
REDIS_URL=redis://127.0.0.1:6380
MQTT_URL=mqtt://127.0.0.1:18883
```

例如在 `src/devices/devices.module.ts` 注册模块，再把 `DevicesModule` 加到 `AppModule.imports`。只需要其中一个模块时，导入对应的模块即可。

```ts
import type { OnModuleInit } from '@nestjs/common'
import { Injectable, Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { MqttModule, MqttService } from '../modules/mqtt/index.js'
import { RedisModule, RedisService } from '../modules/redis/index.js'

@Injectable()
class DeviceStatusService implements OnModuleInit {
  constructor(
    private readonly mqtt: MqttService,
    private readonly redis: RedisService,
  ) {}

  async onModuleInit() {
    await this.mqtt.subscribe('devices/+/status', async (topic, payload) => {
      await this.redis.set(topic, payload.toString('utf8'), 60)
    })
  }

  publishStatus(deviceId: string, status: string) {
    return this.mqtt.publish(`devices/${deviceId}/status`, status)
  }

  getStatus(deviceId: string) {
    return this.redis.get(`devices/${deviceId}/status`)
  }
}

@Module({
  imports: [
    RedisModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        url: config.getOrThrow<string>('REDIS_URL')
      }),
    }),
    MqttModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        url: config.getOrThrow<string>('MQTT_URL')
      }),
    }),
  ],
  providers: [DeviceStatusService],
  exports: [DeviceStatusService],
})
export class DevicesModule {}
```

| 模块 | 可用接口 |
| --- | --- |
| Redis | `get(key)`、`set(key, value, ttlSeconds?)`、`delete(key)`。`client` 提供原生 Redis 命令，例如 `incr` 和 `hGet` |
| MQTT | `publish(topic, payload, options?)` 和 `subscribe(filter, handler, qos?)`。发布与订阅默认 QoS 1，payload 支持字符串和 Buffer。每个过滤器可注册一个处理函数，`subscribe` 返回异步取消订阅函数 |

两者都支持 `register({ url })` 直接传入配置，或按示例通过 `registerAsync` 读取配置。启用后会在应用初始化时建立连接，在应用关闭时释放连接。MQTT 支持 `+` 和 `#`，MQTT.js 会在重连后恢复订阅。QoS 1 消息可能重复送达，涉及写入等副作用的处理函数应能安全地重复执行。

## 构建与验证

```sh
pnpm run ci
pnpm start
```

`pnpm run ci` 运行 ESLint、TypeScript 编译和测试。测试默认覆盖 HTTP、MQTT、TCP、WebSocket、加密和调度。将 `.env.example` 中对应的 `TEST_*` 配置填入 `.env`，即可追加 PostgreSQL、Redis、Kafka、RabbitMQ、OSS 和 TDengine 服务集成测试。请使用专用测试实例，测试会创建并清理临时对象。`pnpm start` 启动编译后的应用。


## GitHub 自动检查

[GitHub Actions](.github/workflows/nestjs-ci.yml) 在分支推送和拉取请求时自动运行，也可从 Actions 页面手动触发。工作流会执行 ESLint、TypeScript 编译，并启动 PostgreSQL、Redis、Kafka、RabbitMQ、TDengine 和 S3 模拟服务执行集成测试。MQTT 测试会自行启动本地 broker。编译包和 JUnit 报告可在运行页面的 **Artifacts** 下载。

将编译包解压到空目录，然后在该目录执行 `pnpm install --prod --frozen-lockfile`，再配置 `.env`、运行数据库迁移和 `pnpm start`。

## 贡献与开源许可证

欢迎提交 Issue 或 Pull Request，说明行为变化和验证方法。提交前运行 `pnpm run ci`。如果变更启动方式或公共模块接口，请同步更新中英文说明。

本项目采用 [Apache License 2.0](LICENSE)。
