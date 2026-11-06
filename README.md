# NestJS Starter

**English** | [简体中文](README_CN.md)

An Apache-2.0 NestJS starter built with Fastify and TypeScript. Start with a REST API backed by PostgreSQL, JWT authentication, and an account-scoped task example. Add only the infrastructure your application needs.

See the [module guide](docs/modules.en.md) for the complete mapping to JSeed's 16 Java starters, including MQTT, Redis, Kafka, RabbitMQ, WebSocket, TCP, object storage, scheduling, cryptography, and TDengine.

## Quick start

Use Node.js 24 or later, pnpm 11, and PostgreSQL. Docker Compose can start a local database.

```sh
pnpm install --frozen-lockfile
cp .env.example .env
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Copy the generated value into `JWT_SECRET` in `.env`, then run:

```sh
docker compose up -d --wait postgres
pnpm run db:migrate
pnpm dev
```

To use an existing PostgreSQL instance, set `DATABASE_URL` and start from the migration command. Open [Swagger UI](http://127.0.0.1:3000/docs), register with `POST /auth/register`, then paste the returned `accessToken` into **Authorize**. Use `/tasks` to create, list, update, and delete your own tasks. The list accepts `limit` and `offset`.

| Endpoint | Purpose |
| --- | --- |
| `GET /health` | Process liveness |
| `GET /health/ready` | PostgreSQL readiness and task schema check |
| `GET /docs` and `GET /docs-json` | Swagger UI and OpenAPI document |

Swagger is enabled by default in development and test. Errors include `statusCode`, `message`, and `requestId`, and responses include the `X-Request-Id` header.

## Use a module

Import the desired module into your NestJS feature module and inject its service. The following example uses the local Redis instance from `docker compose up -d redis`.

```ts
import { Module } from '@nestjs/common'
import { RedisModule } from '../modules/redis/index.js'

@Module({
  imports: [
    RedisModule.register({ url: 'redis://127.0.0.1:6380' })
  ],
})
export class CacheModule {}
```

Inject `RedisService` to call `get`, `set`, and `delete`. Use `registerAsync()` to read options through `ConfigService`. The [module guide](docs/modules.en.md) includes setup and examples for the other modules.

## Checks and builds

Run `pnpm run ci` from this directory to lint, compile, and test the starter. Set the relevant `TEST_*` variables from `.env.example` to run against dedicated test services. The tests create and clean up temporary objects.

[GitHub Actions](.github/workflows/nestjs-ci.yml) runs these checks on pushes and pull requests and can be triggered manually from the Actions tab. CI starts PostgreSQL, Redis, Kafka, RabbitMQ, TDengine, and an S3 mock. The MQTT test starts its own local broker. A successful run publishes the compiled application archive and a JUnit report in **Artifacts**.

The application archive contains `dist`, the dependency manifests, and database migrations. Extract it into an empty directory, run `pnpm install --prod --frozen-lockfile` there, configure `.env`, apply the migration, and run `pnpm start`.

## Contributing and license

Open an issue or submit a pull request with a description of the behavior and how you verified it. Run `pnpm run ci` before submitting, and update the English and Chinese guides when changing setup or public module APIs.

This project is licensed under the [Apache License, Version 2.0](LICENSE).
