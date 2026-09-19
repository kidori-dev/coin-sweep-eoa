import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { SESSION_AUTH } from '../../swagger.setup';
import { UserWalletsService } from '../user-wallets/user-wallets.service';
import {
  FindScanCursorsQueryDto,
  FindScanRunsQueryDto,
  RewindCursorRequestDto,
  RewindCursorResponseDto,
  ScanCursorResponseDto,
  ScanRunResponseDto,
} from './dto/scan.dto';
import { ScanScope } from './entities/scan-cursor.entity';
import { ScanCursorService } from './scan-cursor.service';
import { ScanRunService } from './scan-run.service';

@ApiTags('scan')
@ApiCookieAuth(SESSION_AUTH)
@Controller('scans')
export class ScanController {
  constructor(
    private readonly cursors: ScanCursorService,
    private readonly runs: ScanRunService,
    private readonly wallets: UserWalletsService,
  ) {}

  @Get('cursors')
  @ApiOperation({
    summary: '스캔 커서 목록',
    description:
      '스코프 × 지갑 × 컨트랙트별로 "여기까지는 빠짐없이 조회했다" 는 경계를 돌려준다. ' +
      'truncated 가 true 면 조회 limit 에 걸려 남은 구간이 있다는 뜻이다.',
  })
  @ApiOkResponse({ type: [ScanCursorResponseDto] })
  async findCursors(@Query() query: FindScanCursorsQueryDto): Promise<ScanCursorResponseDto[]> {
    const [cursors, wallets] = await Promise.all([
      this.cursors.findAll(query.scope),
      this.wallets.findAll(),
    ]);
    const addressById = new Map(wallets.map((wallet) => [wallet.id, wallet.address]));

    return cursors.map((cursor) => ({
      id: cursor.id,
      scope: cursor.scope,
      userWalletId: cursor.userWalletId,
      address: cursor.userWalletId ? (addressById.get(cursor.userWalletId) ?? null) : null,
      contract: cursor.contract,
      scannedThroughAt: cursor.scannedThroughAt,
      lastSeenTxid: cursor.lastSeenTxid,
      truncated: cursor.truncated,
      lastRunAt: cursor.lastRunAt,
      lastSuccessAt: cursor.lastSuccessAt,
      lastError: cursor.lastError,
    }));
  }

  @Post('cursors/rewind')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '스캔 커서 강제 되감기',
    description:
      '커서를 과거로 돌려 해당 구간을 다시 훑게 한다. 이미 기록된 입금은 (txid, user_wallet_id) ' +
      '유니크 인덱스에 걸려 다시 반영되지 않으므로 잔고가 두 번 오르지 않는다.',
  })
  @ApiOkResponse({ type: RewindCursorResponseDto })
  async rewind(@Body() dto: RewindCursorRequestDto): Promise<RewindCursorResponseDto> {
    const wallet = dto.address ? await this.wallets.findByAddressOrFail(dto.address) : null;

    const affected = await this.cursors.rewind({
      scope: dto.scope ?? ScanScope.DEPOSIT,
      to: dto.to,
      userWalletId: wallet ? wallet.id : undefined,
      contract: dto.contract ?? undefined,
    });

    return { affected, to: dto.to };
  }

  @Get('runs')
  @ApiOperation({
    summary: '스캔·집금 실행 이력',
    description:
      '실행 1회당 한 행. status 가 running 인 채로 오래 남아 있으면 프로세스가 중간에 죽은 것이다.',
  })
  @ApiOkResponse({ type: [ScanRunResponseDto] })
  findRuns(@Query() query: FindScanRunsQueryDto): Promise<ScanRunResponseDto[]> {
    return this.runs.findAll(query);
  }
}
