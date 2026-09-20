import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TronModule } from '../tron/tron.module';
import { ContractsController } from './contracts.controller';
import { ContractsService } from './contracts.service';
import { Contract } from './entities/contract.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Contract]), TronModule],
  controllers: [ContractsController],
  providers: [ContractsService],
  exports: [ContractsService],
})
export class ContractsModule {}
