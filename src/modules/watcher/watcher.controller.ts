import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { SESSION_AUTH } from '../../swagger.setup';
import { ScanTrigger } from '../scan/entities/scan-run.entity';
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
    summary: '입금 감지 1회 실행',
    description:
      'USDT 컨트랙트로 들어온 입금만 찾아 user_wallet.usdt_amount 를 올린다. ' +
      '지갑별 scan_cursor 가 가리키는 시점부터 "지금 - 확정 지연 버퍼" 까지 훑고, ' +
      '이미 처리한 것은 건너뛴다. 실행 이력은 scan_run 에 남는다 (dryRun 제외).',
  })
  @ApiOkResponse({ type: WatchSummaryResponseDto })
  scan(@Body() dto: WatchRequestDto): Promise<WatchSummaryResponseDto> {
    return this.watcher.scan({ dryRun: dto.dryRun, trigger: ScanTrigger.API });
  }
}
