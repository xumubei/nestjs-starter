import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { AuthModule } from './auth/auth.module.js'
import { validateEnv } from './config/validate-env.js'
import { DatabaseModule } from './database/database.module.js'
import { HealthController } from './health/health.controller.js'
import { TasksModule } from './tasks/tasks.module.js'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    AuthModule,
    DatabaseModule,
    TasksModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
