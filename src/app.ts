// @env node
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import type { FastifyRequest } from 'fastify'
import { randomUUID } from 'node:crypto'
import process from 'node:process'
import { fastifyRequestContext } from '@fastify/request-context'
import { ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter } from '@nestjs/platform-fastify'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { AppModule } from './app.module.js'
import { validateEnv } from './config/validate-env.js'
import { HttpErrorFilter } from './http/http-error.filter.js'

export async function createApp(): Promise<NestFastifyApplication> {
  // Fastify needs the proxy setting at construction, before Nest exposes ConfigService.
  const config = validateEnv(process.env)

  const adapter = new FastifyAdapter({
    genReqId: () => randomUUID(),
    trustProxy: config.TRUST_PROXY,
    logger: {
      serializers: {
        req: (request: FastifyRequest) => ({ method: request.method, url: request.url.split('?')[0] }),
      },
    },
  })
  adapter.getInstance().addHook('onRequest', (request, reply, done) => {
    reply.header('x-request-id', request.id)
    reply.header('x-content-type-options', 'nosniff')
    reply.header('x-frame-options', 'DENY')
    reply.header('referrer-policy', 'no-referrer')
    done()
  })

  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, { abortOnError: false })
  // Keeps per-request data, such as the authenticated account, available to services.
  await app.register(fastifyRequestContext)
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
  app.useGlobalFilters(new HttpErrorFilter())

  if (config.SWAGGER_ENABLED) {
    const options = new DocumentBuilder().setTitle('NestJS Starter').setVersion('1.0').addBearerAuth().build()
    SwaggerModule.setup('docs', app, () => SwaggerModule.createDocument(app, options))
  }

  return app
}
