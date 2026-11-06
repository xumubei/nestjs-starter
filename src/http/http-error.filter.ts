import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { Catch, HttpException } from '@nestjs/common'

@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp()
    const request = http.getRequest<FastifyRequest>()
    const reply = http.getResponse<FastifyReply>()
    let statusCode = 500
    let message: unknown

    if (error instanceof HttpException) {
      statusCode = error.getStatus()
      const response = error.getResponse()
      message = typeof response === 'string'
        ? response
        : 'message' in response
          ? response.message
          : undefined
    }
    else if (error instanceof Error && 'statusCode' in error) {
      const status = error.statusCode
      if (typeof status === 'number' && Number.isInteger(status) && status >= 400 && status < 500) {
        statusCode = status
        message = error.message
      }
    }

    if (statusCode >= 500) {
      request.log.error({ err: error }, 'Unhandled request error')
      message = 'Internal server error'
    }

    reply.status(statusCode).send({
      statusCode,
      message: message ?? 'Request failed',
      requestId: request.id,
    })
  }
}
