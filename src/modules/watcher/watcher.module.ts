import { Module } from '@nestjs/common';

import { ScanModule } from '../scan/scan.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { TronModule } from '../tron/tron.module';
import { UserWalletsModule } from '../user-wallets/user-wallets.module';
import { WatcherController } from './watcher.controller';
import { WatcherService } from './watcher.service';

@Module({
  imports: [TransactionsModule, UserWalletsModule, TronModule, ScanModule],
  controllers: [WatcherController],
  providers: [WatcherService],
  exports: [WatcherService],
})
export class WatcherModule {}
