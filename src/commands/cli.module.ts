import { Module } from '@nestjs/common';

import { AppConfigModule } from '../config/config.module';
import { DatabaseModule } from '../database/database.module';
import { AdminsModule } from '../modules/admins/admins.module';
import { AdminCreateCommand } from './admin-create.command';
import { AdminPasswordCommand } from './admin-password.command';
import { DbSeedCommand } from './db-seed.command';

@Module({
  imports: [AppConfigModule, DatabaseModule, AdminsModule],
  providers: [AdminCreateCommand, AdminPasswordCommand, DbSeedCommand],
})
export class CliModule {}
