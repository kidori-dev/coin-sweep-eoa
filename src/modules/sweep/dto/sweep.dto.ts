import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

import { TransactionStatus } from '../../transactions/entities/transaction.entity';
import { SweepAsset } from '../sweep.types';

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
    description:
      'TRC20 컨트랙트 주소. 네이티브 TRX 는 "TRX" 를 넣는다. ' +
      'contract 테이블에 없는 주소면 체인에서 메타데이터를 읽어 자동 등록한다.',
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

  @ApiProperty({ format: 'uuid', description: 'contract 테이블 참조' })
  contractId!: string;

  @ApiProperty({
    nullable: true,
    type: String,
    description: '컨트랙트 주소. null 이면 네이티브 TRX',
  })
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

  @ApiProperty({ description: '검사한 (지갑 × 자산) 후보 수. 전체 지갑 수가 아니다' })
  scanned!: number;

  @ApiProperty({ type: [SweepItemResponseDto] })
  items!: SweepItemResponseDto[];
}
