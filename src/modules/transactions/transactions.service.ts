import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

import { Contract } from '../contracts/entities/contract.entity';
import { formatUnits } from '../user-wallets/units';
import { Transaction, TransactionStatus, TransactionType } from './entities/transaction.entity';

export interface RecordTransactionInput {
  userWalletId: string;
  type: TransactionType;
  status: TransactionStatus;
  address: string;
  contract: Contract;
  txid?: string | null;
  blockNumber?: number | null;
  logIndex?: number | null;
  fromAddress: string;
  toAddress: string;
  amount: bigint;
  feeStrategy?: string | null;
  feeTxid?: string | null;
  error?: string | null;
  blockTimestamp?: Date | null;
}

export interface TransactionView {
  id: string;
  userWalletId: string;
  type: TransactionType;
  status: TransactionStatus;
  address: string;
  contractId: string;
  contract: string | null;
  tokenSymbol: string;
  txid: string | null;
  blockNumber: number | null;
  fromAddress: string;
  toAddress: string;
  amount: string;
  amountFormatted: string;
  feeStrategy: string | null;
  feeTxid: string | null;
  error: string | null;
  blockTimestamp: Date | null;
  createdAt: Date;
}

export interface FindTransactionsOptions {
  limit?: number;
  userWalletId?: string;
  contractId?: string;
  type?: TransactionType;
}

@Injectable()
export class TransactionsService {
  constructor(
    @InjectRepository(Transaction)
    private readonly repo: Repository<Transaction>,
  ) {}

  /** 이미 기록된 트랜잭션이면 false. 호출자의 DB 트랜잭션 안에서 실행해야 한다. */
  async recordOnce(manager: EntityManager, input: RecordTransactionInput): Promise<boolean> {
    const inserted = await manager
      .createQueryBuilder()
      .insert()
      .into(Transaction)
      .values(this.toRow(input))
      .orIgnore()
      .returning('id')
      .execute();

    return ((inserted.raw ?? []) as unknown[]).length > 0;
  }

  async record(input: RecordTransactionInput): Promise<void> {
    await this.repo.save(this.repo.create(this.toRow(input)));
  }

  private toRow(input: RecordTransactionInput) {
    return {
      userWalletId: input.userWalletId,
      type: input.type,
      status: input.status,
      address: input.address,
      contractId: input.contract.id,
      tokenSymbol: input.contract.symbol,
      tokenDecimals: input.contract.decimals,
      txid: input.txid ?? null,
      blockNumber: input.blockNumber ?? null,
      logIndex: input.logIndex ?? null,
      fromAddress: input.fromAddress,
      toAddress: input.toAddress,
      amount: input.amount.toString(),
      feeStrategy: input.feeStrategy ?? null,
      feeTxid: input.feeTxid ?? null,
      error: input.error ?? null,
      blockTimestamp: input.blockTimestamp ?? null,
    };
  }

  async findAll(options: FindTransactionsOptions = {}): Promise<TransactionView[]> {
    const where: Record<string, unknown> = {};
    if (options.userWalletId) {
      where.userWalletId = options.userWalletId;
    }
    if (options.contractId) {
      where.contractId = options.contractId;
    }
    if (options.type) {
      where.type = options.type;
    }

    const rows = await this.repo.find({
      where,
      relations: { contract: true },
      order: { createdAt: 'DESC' },
      take: options.limit ?? 50,
    });

    return rows.map((row) => ({
      id: row.id,
      userWalletId: row.userWalletId,
      type: row.type,
      status: row.status,
      address: row.address,
      contractId: row.contractId,
      contract: row.contract?.address ?? null,
      // 표시는 기록 당시 스냅샷을 쓴다. contract 행을 고쳐도 과거 금액이 흔들리지 않는다.
      tokenSymbol: row.tokenSymbol,
      txid: row.txid,
      blockNumber: row.blockNumber,
      fromAddress: row.fromAddress,
      toAddress: row.toAddress,
      amount: row.amount,
      amountFormatted: formatUnits(BigInt(row.amount), row.tokenDecimals),
      feeStrategy: row.feeStrategy,
      feeTxid: row.feeTxid,
      error: row.error,
      blockTimestamp: row.blockTimestamp,
      createdAt: row.createdAt,
    }));
  }
}
