import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

export class WatchRequestDto {
  @ApiPropertyOptional({
    example: false,
    description: 'true 면 DB 를 바꾸지 않고 감지된 입금만 돌려준다.',
  })
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;

  @ApiPropertyOptional({
    example: 500,
    description: '이번 실행에서 훑을 최대 블록 수. 생략하면 SCAN_BLOCK_BATCH',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  maxBlocks?: number;
}

export class WatchedDepositResponseDto {
  @ApiProperty({ description: '받은 우리 지갑 주소' })
  address!: string;

  @ApiProperty()
  txid!: string;

  @ApiProperty({ example: 71106814 })
  blockNumber!: number;

  @ApiProperty({ description: '같은 트랜잭션 안에서 몇 번째 로그였는지' })
  logIndex!: number;

  @ApiProperty({ format: 'uuid', description: 'contract 테이블 참조' })
  contractId!: string;

  @ApiProperty({ description: '토큰 컨트랙트 주소' })
  contract!: string;

  @ApiProperty({ example: 'USDT' })
  symbol!: string;

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

  @ApiProperty({
    description: 'deposit_amount 에 반영되었는지. 이미 기록된 입금이면 false',
  })
  applied!: boolean;
}

export class WatchSummaryResponseDto {
  @ApiProperty()
  dryRun!: boolean;

  @ApiProperty({ description: 'true 면 다른 스캔이 돌고 있어 이번엔 아무것도 하지 않았다' })
  skipped!: boolean;

  @ApiProperty({
    nullable: true,
    type: Number,
    description: '이번 실행이 훑은 첫 블록. null 이면 훑을 블록이 없었다',
  })
  fromBlock!: number | null;

  @ApiProperty({ nullable: true, type: Number, description: '이번 실행이 훑은 마지막 블록' })
  toBlock!: number | null;

  @ApiProperty({ description: '확정(solidified)된 최신 블록' })
  solidifiedBlock!: number;

  @ApiProperty({
    description: '아직 남은 블록 수. 0 이 아니면 다음 실행이 이어받는다. 계속 커지면 밀리는 중',
  })
  remainingBlocks!: number;

  @ApiProperty({ description: '이번에 훑은 블록 수' })
  blocksScanned!: number;

  @ApiProperty({ type: [String], description: '스캔 대상 자산 심볼' })
  contracts!: string[];

  @ApiProperty({ description: '대조한 입금주소 수' })
  wallets!: number;

  @ApiProperty({ description: '감지된 입금 건수' })
  found!: number;

  @ApiProperty({ description: '잔고에 새로 반영된 건수' })
  applied!: number;

  @ApiProperty({ type: [WatchedDepositResponseDto] })
  deposits!: WatchedDepositResponseDto[];
}
