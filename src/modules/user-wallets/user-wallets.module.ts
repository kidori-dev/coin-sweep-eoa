import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ContractsModule } from '../contracts/contracts.module';
import { TronModule } from '../tron/tron.module';
import { UserWalletsController } from './user-wallets.controller';
import { UserWalletsService } from './user-wallets.service';
import { UserWalletBalance } from './entities/user-wallet-balance.entity';
import { UserWallet } from './entities/user-wallet.entity';

@Module({
  imports: [TypeOrmModule.forFeature([UserWallet, UserWalletBalance]), TronModule, ContractsModule],
  controllers: [UserWalletsController],
  providers: [UserWalletsService],
  exports: [UserWalletsService],
})
export class UserWalletsModule {}
