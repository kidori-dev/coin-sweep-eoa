import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { UserWalletsModule } from '../user-wallets/user-wallets.module';
import { ScanCursor } from './entities/scan-cursor.entity';
import { ScanRun } from './entities/scan-run.entity';
import { ScanController } from './scan.controller';
import { ScanCursorService } from './scan-cursor.service';
import { ScanRunService } from './scan-run.service';

@Module({
  imports: [TypeOrmModule.forFeature([ScanCursor, ScanRun]), UserWalletsModule],
  controllers: [ScanController],
  providers: [ScanCursorService, ScanRunService],
  exports: [ScanCursorService, ScanRunService],
})
export class ScanModule {}
