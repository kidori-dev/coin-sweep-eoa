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

  @ApiProperty({ type: [WatchedDepositResponseDto] })
  deposits!: WatchedDepositResponseDto[];
}
