// @env node
import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { EventEmitter, once } from 'node:events'
import process from 'node:process'
import { text } from 'node:stream/consumers'
import { it } from 'node:test'
import { Module } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { connect } from 'amqplib'
import { Kafka, logLevel } from 'kafkajs'
import { KafkaModule, KafkaService } from '../dist/modules/kafka/index.js'
import { OssModule, OssService } from '../dist/modules/oss/index.js'
import { RabbitMqModule, RabbitMqService } from '../dist/modules/rabbitmq/index.js'
import { TdengineModule, TdengineService } from '../dist/modules/tdengine/index.js'

async function createContext(registration) {
  class IntegrationModule {}
  Module({
    imports: [registration],
  })(IntegrationModule)
  return NestFactory.createApplicationContext(IntegrationModule, { logger: false, abortOnError: false })
}

const kafkaBrokers = process.env.TEST_KAFKA_BROKERS
it('Kafka retries before forwarding a failure to the dead-letter topic', { skip: !kafkaBrokers && 'Set TEST_KAFKA_BROKERS', timeout: 30000 }, async () => {
  const brokers = kafkaBrokers.split(',').map(value => value.trim())
  const topic = `jseed-test-${randomUUID()}`
  const deadLetterTopic = `${topic}.DLT`
  const config = { brokers, logLevel: logLevel.NOTHING }
  const admin = new Kafka(config).admin()
  await admin.connect()
  let app
  try {
    await admin.createTopics({
      topics: [
        { topic },
        { topic: deadLetterTopic },
      ],
    })
    app = await createContext(KafkaModule.register({ ...config, maxAttempts: 2, backoffMs: 10 }))
    const kafka = app.get(KafkaService)
    let attempts = 0
    const events = new EventEmitter()
    await kafka.subscribe({
      groupId: `${topic}-source`,
      topics: [topic],
      fromBeginning: true,
      deadLetterTopic,
    }, async () => {
      attempts++
      throw new Error('processing failed')
    })
    await kafka.subscribe({
      groupId: `${topic}-dlq`,
      topics: [deadLetterTopic],
      fromBeginning: true,
    }, async ({ message }) => {
      events.emit('dead-letter', message)
    })
    const message = once(events, 'dead-letter', {
      signal: AbortSignal.timeout(10000),
    })
    await kafka.publish({
      topic,
      messages: [
        { key: 'device-a', value: 'ping' },
      ],
    })
    const [deadLetter] = await message
    assert.equal(attempts, 2)
    assert.equal(deadLetter.value.toString(), 'ping')
    assert.equal(deadLetter.headers['source-topic'].toString(), topic)
  }
  finally {
    try {
      await app?.close()
      await admin.deleteTopics({
        topics: [topic, deadLetterTopic],
      })
    }
    finally {
      await admin.disconnect()
    }
  }
})

const rabbitUrl = process.env.TEST_RABBITMQ_URL
it('RabbitMQ rejects unroutable publishes and dead-letters after retries', { skip: !rabbitUrl && 'Set TEST_RABBITMQ_URL', timeout: 20000 }, async () => {
  const name = `jseed-test-${randomUUID()}`
  const dlq = `${name}.dlq`
  const connection = await connect(rabbitUrl, { timeout: 5000 })
  const setup = await connection.createChannel()
  let app
  try {
    await setup.assertQueue(dlq, { durable: true })
    await setup.assertQueue(name, {
      durable: true,
      deadLetterExchange: '',
      deadLetterRoutingKey: dlq,
    })
    app = await createContext(RabbitMqModule.register({ url: rabbitUrl, maxAttempts: 2 }))
    const rabbit = app.get(RabbitMqService)
    await assert.rejects(rabbit.publish(`${name}.missing`, Buffer.from('missing')), /unroutable/)
    let attempts = 0
    await rabbit.subscribe(name, async () => {
      attempts++
      throw new Error('processing failed')
    })
    const events = new EventEmitter()
    await setup.consume(dlq, (message) => {
      if (message) {
        setup.ack(message)
        events.emit('dead-letter', message.content.toString())
      }
    })
    const message = once(events, 'dead-letter', {
      signal: AbortSignal.timeout(8000),
    })
    await rabbit.publish(name, Buffer.from('ping'))
    assert.deepEqual(await message, ['ping'])
    assert.equal(attempts, 2)
  }
  finally {
    try {
      await app?.close()
      await setup.deleteQueue(name)
      await setup.deleteQueue(dlq)
    }
    finally {
      await connection.close()
    }
  }
})

const ossEndpoint = process.env.TEST_OSS_URL
it('OSS uploads, streams downloads, and signs temporary URLs', { skip: !ossEndpoint && 'Set TEST_OSS_URL', timeout: 20000 }, async () => {
  const url = new URL(ossEndpoint)
  const bucket = `jseed-test-${randomUUID()}`
  const app = await createContext(OssModule.register({
    bucket,
    client: {
      endPoint: url.hostname,
      port: Number(url.port) || undefined,
      useSSL: url.protocol === 'https:',
      accessKey: process.env.TEST_OSS_ACCESS_KEY,
      secretKey: process.env.TEST_OSS_SECRET_KEY,
    },
  }))
  const oss = app.get(OssService)
  try {
    await oss.client.makeBucket(bucket, 'us-east-1')
    try {
      const key = 'devices/a.txt'
      await oss.put(key, Buffer.from('ping'), { contentType: 'text/plain' })
      assert.equal((await oss.stat(key)).size, 4)
      assert.equal(await text(await oss.get(key)), 'ping')
      const response = await fetch(await oss.presignDownload(key), {
        signal: AbortSignal.timeout(5000),
      })
      assert.equal(response.status, 200)
      assert.equal(await response.text(), 'ping')
      assert.match(await oss.presignUpload(key), /X-Amz-Signature=/)
      await oss.remove(key)
    }
    finally {
      await oss.client.removeBucket(bucket)
    }
  }
  finally {
    await app.close()
  }
})

const tdengineUrl = process.env.TEST_TDENGINE_URL
it('TDengine queries through its WebSocket connector', { skip: !tdengineUrl && 'Set TEST_TDENGINE_URL', timeout: 15000 }, async () => {
  const app = await createContext(TdengineModule.register({ url: tdengineUrl }))
  try {
    const rows = await app.get(TdengineService).query('SELECT SERVER_VERSION()')
    try {
      assert.equal(await rows.next(), true)
      assert.ok(rows.getData()?.length)
    }
    finally {
      await rows.close()
    }
  }
  finally {
    await app.close()
  }
})
