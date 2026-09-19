import { Module } from '@nestjs/common';

import { HdWalletService } from './hd-wallet.service';
import { TronService } from './tron.service';

@Module({
  providers: [TronService, HdWalletService],
  exports: [TronService, HdWalletService],
})
export class TronModule {}
