import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class WatchRequestDto {
  @ApiPropertyOptional({
    example: false,
    description: 'true 면 DB 를 바꾸지 않고 감지된 입금만 돌려준다.',
  })
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}

export class WatchedDepositResponseDto {
  @ApiProperty()
  address!: string;

  @ApiProperty()
  txid!: string;

  @ApiProperty({ description: '토큰 컨트랙트 주소' })
  contract!: string;

  @ApiProperty({ description: '보낸 주소' })
  from!: string;

  @ApiProperty({ description: '받은 주소 (우리 지갑)' })
  to!: string;

  @ApiProperty({ description: '최소 단위 금액' })
  amount!: string;

  @ApiProperty({ example: '12.500000' })
  amountFormatted!: string;

  @ApiProperty({ format: 'date-time' })
  blockTimestamp!: Date;

  @ApiProperty({ description: 'usdt_amount 에 반영되었는지. 이미 처리한 입금이면 false' })
  applied!: boolean;

  @ApiProperty({
    description: '확정 지연 버퍼 안쪽이라 이번엔 미뤘다. 다음 스캔에서 반영된다',
  })
  pending!: boolean;
}

export class WatchSummaryResponseDto {
  @ApiProperty()
  dryRun!: boolean;

  @ApiProperty({ description: '감시 대상 컨트랙트 (USDT)' })
  contract!: string;

  @ApiProperty({ example: 'USDT' })
  symbol!: string;

  @ApiProperty({ description: '검사한 지갑 수' })
  scanned!: number;

  @ApiProperty({ description: '감지된 입금 건수' })
  found!: number;

  @ApiProperty({ description: '잔고에 반영된 건수' })
  applied!: number;

  @ApiProperty({ description: '확정 지연 버퍼에 걸려 다음 스캔으로 미룬 건수' })
  pending!: number;

  @ApiProperty({
    description: '조회에 실패한 지갑 수. 커서가 전진하지 않아 다음 스캔이 재시도한다',
  })
  failed!: number;

  @ApiProperty({ description: '조회 limit 에 걸려 남은 구간이 있는 지갑 수' })
  truncated!: number;

  @ApiProperty({
    nullable: true,
    format: 'date-time',
    type: String,
    description: '이번 스캔이 훑은 구간의 시작 (커서 중 가장 뒤처진 것)',
  })
  windowFrom!: Date | null;

  @ApiProperty({ format: 'date-time', description: '이번 스캔이 조회 완료로 간주한 경계' })
  windowTo!: Date;

  @ApiProperty({
    nullable: true,
    type: String,
    description: 'scan_run 행 id. dryRun 이면 기록하지 않으므로 null',
  })
  runId!: string | null;

  @ApiProperty({ type: [WatchedDepositResponseDto] })
  deposits!: WatchedDepositResponseDto[];
}
