import { ApiProperty } from '@nestjs/swagger';

import { TokenMeta } from '../../tron/tron.service';
import { UserWallet } from '../entities/user-wallet.entity';
import { formatUnits } from '../units';

export class UserWalletResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'TWer2Ygk5TEheHp3TPuYeqxmB6SsGZmaL6' })
  address!: string;

  @ApiProperty({ example: 1, description: 'HD 파생 인덱스' })
  derivationIndex!: number;

  @ApiProperty({ example: 'user-1024', nullable: true, type: String })
  userRef!: string | null;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiProperty({
    example: '150000000',
    description: 'DB 가 들고 있는 USDT 잔고 (최소 단위). 입금 와쳐가 올려준다.',
  })
  usdtAmount!: string;

  @ApiProperty({ example: '150.000000', description: 'usdtAmount 에 decimals 를 적용한 표시용 값' })
  usdtAmountFormatted!: string;

  @ApiProperty({ example: 'USDT' })
  usdtSymbol!: string;

  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  lastSweptAt!: Date | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;

  static from(entity: UserWallet, token: TokenMeta): UserWalletResponseDto {
    return {
      id: entity.id,
      address: entity.address,
      derivationIndex: entity.derivationIndex,
      userRef: entity.userRef,
      isActive: entity.isActive,
      usdtAmount: entity.usdtAmount,
      usdtAmountFormatted: formatUnits(BigInt(entity.usdtAmount), token.decimals),
      usdtSymbol: token.symbol,
      lastSweptAt: entity.lastSweptAt,
      createdAt: entity.createdAt,
    };
  }
}

export class UserWalletBalanceResponseDto {
  @ApiProperty({ example: 'TWer2Ygk5TEheHp3TPuYeqxmB6SsGZmaL6' })
  address!: string;

  @ApiProperty({ example: '5000000', description: 'TRX 잔액 (SUN, 1 TRX = 1e6)' })
  trxSun!: string;

  @ApiProperty({ example: '5.000000', description: 'TRX 잔액 (사람이 읽는 단위)' })
  trx!: string;

  @ApiProperty({ example: '1500000', description: '토큰 잔액 (최소 단위)' })
  tokenRaw!: string;

  @ApiProperty({ example: '1.500000', description: '토큰 잔액 (decimals 적용)' })
  token!: string;

  @ApiProperty({ example: 'USDT' })
  tokenSymbol!: string;
}
