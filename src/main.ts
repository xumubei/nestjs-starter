// @env node
import type { AppConfig } from './config/types.js'
import process from 'node:process'
import { ConfigService } from '@nestjs/config'
import { createApp } from './app.js'

async function bootstrap(): Promise<void> {
  const app = await createApp()
  const config = app.get<ConfigService<AppConfig, true>>(ConfigService)

  app.enableShutdownHooks()
  await app.listen(config.get('PORT', { infer: true }), config.get('HOST', { infer: true }))
}

bootstrap().catch((error: unknown) => {
  console.error(error)
  // An initialization failure can leave connections opened by earlier modules.
  process.exit(1)
})
