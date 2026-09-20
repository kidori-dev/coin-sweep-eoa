import { Module } from '@nestjs/common';
import { ContractsModule } from '../contracts/contracts.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { UserWalletsModule } from '../user-wallets/user-wallets.module';
import { TronModule } from '../tron/tron.module';
import { SweepController } from './sweep.controller';
import { SweepService } from './sweep.service';

@Module({
  imports: [TransactionsModule, UserWalletsModule, TronModule, ContractsModule],
  controllers: [SweepController],
  providers: [SweepService],
  exports: [SweepService],
})
export class SweepModule {}
