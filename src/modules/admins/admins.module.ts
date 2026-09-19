import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AdminsService } from './admins.service';
import { Admin } from './entities/admin.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Admin])],
  providers: [AdminsService],
  exports: [AdminsService],
})
export class AdminsModule {}
