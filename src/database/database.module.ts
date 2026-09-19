import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { join } from 'path';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres' as const,
        host: config.get<string>('database.host'),
        port: config.get<number>('database.port'),
        username: config.get<string>('database.username'),
        password: config.get<string>('database.password'),
        database: config.get<string>('database.name'),
        entities: [join(__dirname, '..', '**', '*.entity.{ts,js}')],
        migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
        migrationsTableName: 'migrations',
        uuidExtension: 'pgcrypto' as const,
        synchronize: false,
        migrationsRun: false,
        logging: config.get<boolean>('database.logging'),
      }),
    }),
  ],
})
export class DatabaseModule {}
