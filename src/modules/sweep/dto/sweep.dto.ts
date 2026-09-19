import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

import { TransactionStatus } from '../../transactions/entities/transaction.entity';
import { SweepAsset } from '../sweep.service';

export class SweepRequestDto {
  @ApiPropertyOptional({
    example: false,
    description: 'true 면 전송 없이 집금 대상만 계산한다.',
  })
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}

export class ManualSweepRequestDto {
  @ApiProperty({
    example: 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf',
    description: 'TRC20 컨트랙트 주소. 네이티브 TRX 는 "TRX" 를 넣는다.',
  })
  @IsString()
  @MaxLength(64)
  contract!: string;

  @ApiProperty({
    example: 'TGvDeLTv2t5ExSr4feakLjDCjbRDKAnrKz',
    description: '대상 입금주소',
  })
  @IsString()
  @MaxLength(64)
  address!: string;

  @ApiPropertyOptional({ example: false, description: 'true 면 전송 없이 대상만 계산한다.' })
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}

export class SweepItemResponseDto {
  @ApiProperty()
  address!: string;

  @ApiProperty({ enum: SweepAsset })
  asset!: SweepAsset;

  @ApiProperty({ nullable: true, type: String })
  contract!: string | null;

  @ApiProperty({ description: '최소 단위 금액' })
  amount!: string;

  @ApiProperty({ example: '8.000000', description: 'decimals 를 적용한 표시용 금액' })
  amountFormatted!: string;

  @ApiProperty({ example: 'USDT' })
  symbol!: string;

  @ApiProperty({ enum: TransactionStatus })
  status!: TransactionStatus;

  @ApiProperty({ nullable: true, type: String })
  txid?: string;

  @ApiProperty({ nullable: true, type: String })
  feeStrategy?: string;

  @ApiProperty({ nullable: true, type: String })
  feeTxid?: string;

  @ApiProperty({ nullable: true, type: String })
  error?: string;

  @ApiProperty({ nullable: true, type: String })
  reason?: string;
}

export class SweepSummaryResponseDto {
  @ApiProperty()
  dryRun!: boolean;

  @ApiProperty({ description: '집금 목적지 (메인지갑)' })
  mainAddress!: string;

  @ApiProperty({ description: '집금 대상 컨트랙트' })
  contract!: string;

  @ApiProperty({ description: '검사한 입금주소 수' })
  scanned!: number;

  @ApiProperty({ type: [SweepItemResponseDto] })
  items!: SweepItemResponseDto[];
}
