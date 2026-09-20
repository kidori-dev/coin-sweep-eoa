import { Module } from '@nestjs/common';

import { AppConfigModule } from '../config/config.module';
import { DatabaseModule } from '../database/database.module';
import { AdminsModule } from '../modules/admins/admins.module';
import { ContractsModule } from '../modules/contracts/contracts.module';
import { UserWalletsModule } from '../modules/user-wallets/user-wallets.module';
import { SweepModule } from '../modules/sweep/sweep.module';
import { TransactionsModule } from '../modules/transactions/transactions.module';
import { WatcherModule } from '../modules/watcher/watcher.module';
import { TronModule } from '../modules/tron/tron.module';
import { AdminCreateCommand } from './admin-create.command';
import { AdminPasswordCommand } from './admin-password.command';
import { DbSeedCommand } from './db-seed.command';
import { TronBalanceCommand, TronIssueCommand } from './tron-address.command';
import { TronBackfillCommand } from './tron-backfill.command';
import { TronContractAddCommand, TronContractListCommand } from './tron-contract.command';
import { TronInfoCommand } from './tron-info.command';
import { TronWatchCommand } from './tron-watch.command';
import { TronManualSweepCommand, TronStakeCommand, TronSweepCommand } from './tron-sweep.command';

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    AdminsModule,
    TronModule,
    ContractsModule,
    UserWalletsModule,
    SweepModule,
    TransactionsModule,
    WatcherModule,
  ],
  providers: [
    AdminCreateCommand,
    AdminPasswordCommand,
    DbSeedCommand,
    TronInfoCommand,
    TronContractListCommand,
    TronContractAddCommand,
    TronBackfillCommand,
    TronIssueCommand,
    TronBalanceCommand,
    TronSweepCommand,
    TronManualSweepCommand,
    TronStakeCommand,
    TronWatchCommand,
  ],
})
export class CliModule {}
