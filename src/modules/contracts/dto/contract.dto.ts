import { ApiProperty } from '@nestjs/swagger';

import { formatUnits } from '../../user-wallets/units';
import { Contract } from '../entities/contract.entity';

export class ContractResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'tron' })
  chain!: string;

  @ApiProperty({
    example: 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf',
    nullable: true,
    type: String,
    description: '컨트랙트 주소. null 이면 네이티브 TRX',
  })
  address!: string | null;

  @ApiProperty({ example: 'USDT' })
  symbol!: string;

  @ApiProperty({ example: 6 })
  decimals!: number;

  @ApiProperty({ description: '네이티브 자산 여부' })
  isNative!: boolean;

  @ApiProperty({ description: 'false 면 새 작업에 쓰지 않는다' })
  isActive!: boolean;

  @ApiProperty({ example: '5000000', description: '자동 집금 최소 금액 (최소 단위)' })
  minSweepAmount!: string;

  @ApiProperty({ example: '5.000000' })
  minSweepAmountFormatted!: string;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;

  static from(entity: Contract): ContractResponseDto {
    return {
      id: entity.id,
      chain: entity.chain,
      address: entity.address,
      symbol: entity.symbol,
      decimals: entity.decimals,
      isNative: entity.isNative,
      isActive: entity.isActive,
      minSweepAmount: entity.minSweepAmount,
      minSweepAmountFormatted: formatUnits(BigInt(entity.minSweepAmount), entity.decimals),
      createdAt: entity.createdAt,
    };
  }
}
