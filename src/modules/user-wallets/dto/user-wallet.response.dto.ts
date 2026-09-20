import { ApiProperty } from '@nestjs/swagger';

import { Contract } from '../../contracts/entities/contract.entity';
import { UserWalletBalance } from '../entities/user-wallet-balance.entity';
import { UserWallet } from '../entities/user-wallet.entity';
import { formatUnits } from '../units';

export class UserWalletBalanceResponseDto {
  @ApiProperty({ format: 'uuid' })
  contractId!: string;

  @ApiProperty({
    example: 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf',
    nullable: true,
    type: String,
    description: '컨트랙트 주소. null 이면 네이티브 TRX',
  })
  contract!: string | null;

  @ApiProperty({ example: 'USDT' })
  symbol!: string;

  @ApiProperty({ example: '150000000', description: '입금 누계 (최소 단위). 줄지 않는다' })
  depositAmount!: string;

  @ApiProperty({ example: '50000000', description: '집금 누계 (최소 단위). 줄지 않는다' })
  sweepAmount!: string;

  @ApiProperty({ example: '100000000', description: '미집금 잔액 = depositAmount - sweepAmount' })
  pendingAmount!: string;

  @ApiProperty({ example: '100.000000', description: 'pendingAmount 에 decimals 를 적용한 값' })
  pendingAmountFormatted!: string;

  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  lastSweptAt!: Date | null;

  static from(balance: UserWalletBalance, contract: Contract): UserWalletBalanceResponseDto {
    return {
      contractId: contract.id,
      contract: contract.address,
      symbol: contract.symbol,
      depositAmount: balance.depositAmount,
      sweepAmount: balance.sweepAmount,
      pendingAmount: balance.pendingAmount,
      pendingAmountFormatted: formatUnits(BigInt(balance.pendingAmount), contract.decimals),
      lastSweptAt: balance.lastSweptAt,
    };
  }

  static zero(contract: Contract): UserWalletBalanceResponseDto {
    return {
      contractId: contract.id,
      contract: contract.address,
      symbol: contract.symbol,
      depositAmount: '0',
      sweepAmount: '0',
      pendingAmount: '0',
      pendingAmountFormatted: formatUnits(0n, contract.decimals),
      lastSweptAt: null,
    };
  }
}

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
    type: [UserWalletBalanceResponseDto],
    description:
      '자산별 DB 잔고. 활성 컨트랙트는 입금이 아직 없어도 0 으로 항상 포함되므로 응답 모양이 일정하다. ' +
      '비활성 컨트랙트는 잔고 행이 남아 있을 때만 나온다.',
  })
  balances!: UserWalletBalanceResponseDto[];

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;

  /** activeContracts 는 잔고가 없어도 0 으로 채워 넣을 자산 목록이다 */
  static from(
    entity: UserWallet,
    balances: UserWalletBalance[],
    activeContracts: Contract[],
  ): UserWalletResponseDto {
    const views = balances.map((balance) =>
      UserWalletBalanceResponseDto.from(balance, balance.contract),
    );
    const present = new Set(views.map((view) => view.contractId));
    for (const contract of activeContracts) {
      if (!present.has(contract.id)) {
        views.push(UserWalletBalanceResponseDto.zero(contract));
      }
    }

    return {
      id: entity.id,
      address: entity.address,
      derivationIndex: entity.derivationIndex,
      userRef: entity.userRef,
      isActive: entity.isActive,
      balances: views.sort((a, b) => a.symbol.localeCompare(b.symbol)),
      createdAt: entity.createdAt,
    };
  }
}

export class ChainTokenBalanceResponseDto {
  @ApiProperty({ format: 'uuid' })
  contractId!: string;

  @ApiProperty({ example: 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf' })
  contract!: string;

  @ApiProperty({ example: 'USDT' })
  symbol!: string;

  @ApiProperty({ example: 6 })
  decimals!: number;

  @ApiProperty({ example: '1500000', description: '최소 단위 잔액' })
  raw!: string;

  @ApiProperty({ example: '1.500000', description: 'decimals 를 적용한 값' })
  formatted!: string;

  @ApiProperty({
    description: 'false 면 감시·자동집금에서 뺀 자산. 잔액이 남아 있으면 그대로 보인다',
  })
  isActive!: boolean;
}

export class UserWalletChainBalanceResponseDto {
  @ApiProperty({ example: 'TWer2Ygk5TEheHp3TPuYeqxmB6SsGZmaL6' })
  address!: string;

  @ApiProperty({ example: '5000000', description: 'TRX 잔액 (SUN, 1 TRX = 1e6)' })
  trxSun!: string;

  @ApiProperty({ example: '5.000000', description: 'TRX 잔액 (사람이 읽는 단위)' })
  trx!: string;

  @ApiProperty({
    type: [ChainTokenBalanceResponseDto],
    description: '등록된 TRC20 전부의 체인 실잔액. 비활성 컨트랙트도 포함한다',
  })
  tokens!: ChainTokenBalanceResponseDto[];
}
