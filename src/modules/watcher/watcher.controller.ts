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
    summary: '입금 감지 1회 실행',
    description:
      'USDT 컨트랙트로 들어온 입금만 찾아 user_wallet.usdt_amount 를 올린다. ' +
      '지갑별로 마지막 입금 시점(없으면 지갑 생성 시각)부터 현재까지 훑고, 이미 처리한 것은 건너뛴다.',
  })
  @ApiOkResponse({ type: WatchSummaryResponseDto })
  scan(@Body() dto: WatchRequestDto): Promise<WatchSummaryResponseDto> {
    return this.watcher.scan({ dryRun: dto.dryRun });
  }
}
