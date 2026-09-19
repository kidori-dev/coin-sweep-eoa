import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AuthenticatedGuard } from './common/guards/authenticated.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { AppConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { AdminsModule } from './modules/admins/admins.module';
import { AuthModule } from './modules/auth/auth.module';

@Module({
  imports: [
    AppConfigModule,
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            name: 'default',
            ttl: config.get<number>('throttle.ttl')!,
            limit: config.get<number>('throttle.limit')!,
          },
        ],
      }),
    }),
    DatabaseModule,
    HealthModule,
    AuthModule,
    AdminsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthenticatedGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
