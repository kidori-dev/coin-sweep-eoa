import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { SESSION_AUTH } from '../../swagger.setup';
import { ManualSweepRequestDto, SweepRequestDto, SweepSummaryResponseDto } from './dto/sweep.dto';
import { SweepService } from './sweep.service';

@ApiTags('sweep')
@ApiCookieAuth(SESSION_AUTH)
@Controller('sweeps')
export class SweepController {
  constructor(private readonly sweep: SweepService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '집금 실행',
    description:
      '등록된 활성 TRC20 전부에 대해, DB 미집금 잔액이 min_sweep_amount 이상인 지갑을 ' +
      '메인지갑으로 모은다. 후보 선정에 체인 호출이 없다. dryRun 으로 먼저 확인할 수 있다.',
  })
  @ApiOkResponse({ type: SweepSummaryResponseDto })
  run(@Body() dto: SweepRequestDto): Promise<SweepSummaryResponseDto> {
    return this.sweep.sweepAll({ dryRun: dto.dryRun });
  }

  @Post('manual')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '수동 집금',
    description:
      '특정 컨트랙트의 잔액 전부를 특정 주소 또는 특정 유저의 모든 입금주소에서 가져온다. ' +
      '최소 집금액을 무시한다. 네이티브 TRX 는 contract 에 "TRX".',
  })
  @ApiOkResponse({ type: SweepSummaryResponseDto })
  @ApiBadRequestResponse({ description: 'address / userRef 미지정, 또는 대상 없음' })
  runManual(@Body() dto: ManualSweepRequestDto): Promise<SweepSummaryResponseDto> {
    return this.sweep.sweepManual(dto);
  }
}
