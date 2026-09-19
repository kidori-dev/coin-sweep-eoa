import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TronModule } from '../tron/tron.module';
import { UserWalletsController } from './user-wallets.controller';
import { UserWalletsService } from './user-wallets.service';
import { UserWallet } from './entities/user-wallet.entity';

@Module({
  imports: [TypeOrmModule.forFeature([UserWallet]), TronModule],
  controllers: [UserWalletsController],
  providers: [UserWalletsService],
  exports: [UserWalletsService],
})
export class UserWalletsModule {}
