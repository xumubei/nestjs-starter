// @env node
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import type { FastifyRequest } from 'fastify'
import type { AppConfig } from './config/types.js'
import { randomUUID } from 'node:crypto'
import { ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter } from '@nestjs/platform-fastify'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { AppModule } from './app.module.js'
import { HttpErrorFilter } from './http/http-error.filter.js'
import 'reflect-metadata'

export async function createApp(): Promise<NestFastifyApplication> {
  const adapter = new FastifyAdapter({
    genReqId: () => randomUUID(),
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
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
  app.useGlobalFilters(new HttpErrorFilter())

  const config = app.get<ConfigService<AppConfig, true>>(ConfigService)
  if (config.get('SWAGGER_ENABLED', { infer: true })) {
    const options = new DocumentBuilder().setTitle('NestJS Starter').setVersion('1.0').addBearerAuth().build()
    SwaggerModule.setup('docs', app, () => SwaggerModule.createDocument(app, options))
  }

  return app
}
