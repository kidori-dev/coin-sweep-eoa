import { Module } from '@nestjs/common';

import { AppConfigModule } from '../config/config.module';
import { DatabaseModule } from '../database/database.module';
import { AdminsModule } from '../modules/admins/admins.module';
import { DepositAddressesModule } from '../modules/deposit-addresses/deposit-addresses.module';
import { SweepModule } from '../modules/sweep/sweep.module';
import { TronModule } from '../modules/tron/tron.module';
import { AdminCreateCommand } from './admin-create.command';
import { AdminPasswordCommand } from './admin-password.command';
import { DbSeedCommand } from './db-seed.command';
import { TronBalanceCommand, TronIssueCommand } from './tron-address.command';
import { TronInfoCommand } from './tron-info.command';
import { TronStakeCommand, TronSweepCommand } from './tron-sweep.command';

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    AdminsModule,
    TronModule,
    DepositAddressesModule,
    SweepModule,
  ],
  providers: [
    AdminCreateCommand,
    AdminPasswordCommand,
    DbSeedCommand,
    TronInfoCommand,
    TronIssueCommand,
    TronBalanceCommand,
    TronSweepCommand,
    TronStakeCommand,
  ],
})
export class CliModule {}
