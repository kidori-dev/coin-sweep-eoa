import { ApiProperty } from '@nestjs/swagger';

import { TransactionStatus, TransactionType } from '../entities/transaction.entity';

export class TransactionResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  userWalletId!: string;

  @ApiProperty({ enum: TransactionType })
  type!: TransactionType;

  @ApiProperty({ enum: TransactionStatus })
  status!: TransactionStatus;

  @ApiProperty({ description: '대상 유저 지갑 주소' })
  address!: string;

  @ApiProperty({
    example: 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf',
    nullable: true,
    type: String,
    description: '토큰 컨트랙트 주소. null 이면 네이티브 TRX',
  })
  contract!: string | null;

  @ApiProperty({ example: 'USDT' })
  tokenSymbol!: string;

  @ApiProperty({
    example: '54ce18e5507aa599517974259968ea66864946c3dab56b183214224973d46448',
    nullable: true,
    type: String,
    description: '실패/스킵된 집금은 null',
  })
  txid!: string | null;

  @ApiProperty({ example: 'TXgP1vXh7yFEYonq7oqsUPrkFJ73P8ztFA', description: '보낸 주소' })
  fromAddress!: string;

  @ApiProperty({ example: 'TGvDeLTv2t5ExSr4feakLjDCjbRDKAnrKz', description: '받은 주소' })
  toAddress!: string;

  @ApiProperty({ example: '3000000', description: '최소 단위 금액' })
  amount!: string;

  @ApiProperty({ example: '3.000000' })
  amountFormatted!: string;

  @ApiProperty({ nullable: true, type: String, description: '집금 때 사용한 수수료 전략' })
  feeStrategy!: string | null;

  @ApiProperty({ nullable: true, type: String, description: '수수료 트랜잭션 해시' })
  feeTxid!: string | null;

  @ApiProperty({ nullable: true, type: String, description: '실패 사유' })
  error!: string | null;

  @ApiProperty({
    format: 'date-time',
    nullable: true,
    type: String,
    description: '체인에 포함된 시각 (입금만)',
  })
  blockTimestamp!: Date | null;

  @ApiProperty({ format: 'date-time', description: '우리 DB 에 기록된 시각' })
  createdAt!: Date;
}
