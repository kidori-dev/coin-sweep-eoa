import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ContractsModule } from '../contracts/contracts.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { TronModule } from '../tron/tron.module';
import { UserWalletsModule } from '../user-wallets/user-wallets.module';
import { ChainScanState } from './entities/chain-scan-state.entity';
import { ScanStateService } from './scan-state.service';
import { WatcherController } from './watcher.controller';
import { WatcherService } from './watcher.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ChainScanState]),
    TransactionsModule,
    UserWalletsModule,
    TronModule,
    ContractsModule,
  ],
  controllers: [WatcherController],
  providers: [WatcherService, ScanStateService],
  exports: [WatcherService, ScanStateService],
})
export class WatcherModule {}
