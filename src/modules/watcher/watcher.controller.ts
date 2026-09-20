import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { SESSION_AUTH } from '../../swagger.setup';
import { WatchRequestDto, WatchSummaryResponseDto } from './dto/watch.dto';
import { WatcherService } from './watcher.service';

@ApiTags('watcher')
@ApiCookieAuth(SESSION_AUTH)
@Controller('watcher')
export class WatcherController {
  constructor(private readonly watcher: WatcherService) {}

  @Post('scan')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '입금 블록 스캔 1회 실행',
    description:
      'contract.last_scanned_block 다음 블록부터 확정(solidified) 블록까지 훑어, ' +
      '등록된 TRC20 중 우리 입금주소로 들어온 전송을 찾아 user_wallet_balance.deposit_amount 를 올린다. ' +
      '지갑 수와 무관하게 블록당 1콜이고, 한 번에 SCAN_BLOCK_BATCH 블록까지만 처리한다.',
  })
  @ApiOkResponse({ type: WatchSummaryResponseDto })
  scan(@Body() dto: WatchRequestDto): Promise<WatchSummaryResponseDto> {
    return this.watcher.scan({ dryRun: dto.dryRun, maxBlocks: dto.maxBlocks });
  }
}
