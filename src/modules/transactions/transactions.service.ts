import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

import { formatUnits } from '../user-wallets/units';
import { Transaction, TransactionStatus, TransactionType } from './entities/transaction.entity';

export interface RecordTransactionInput {
  userWalletId: string;
  type: TransactionType;
  status: TransactionStatus;
  address: string;
  contract: string | null;
  tokenSymbol: string;
  tokenDecimals: number;
  txid?: string | null;
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
  contract: string | null;
  tokenSymbol: string;
  txid: string | null;
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
      contract: input.contract,
      tokenSymbol: input.tokenSymbol,
      tokenDecimals: input.tokenDecimals,
      txid: input.txid ?? null,
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
    if (options.type) {
      where.type = options.type;
    }

    const rows = await this.repo.find({
      where,
      order: { createdAt: 'DESC' },
      take: options.limit ?? 50,
    });

    return rows.map((row) => ({
      id: row.id,
      userWalletId: row.userWalletId,
      type: row.type,
      status: row.status,
      address: row.address,
      contract: row.contract,
      tokenSymbol: row.tokenSymbol,
      txid: row.txid,
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

  lastBlockTimestamp(userWalletId: string): Promise<{ max: Date | null } | undefined> {
    return this.repo
      .createQueryBuilder('t')
      .select('MAX(t.blockTimestamp)', 'max')
      .where('t.userWalletId = :userWalletId', { userWalletId })
      .andWhere('t.type = :type', { type: TransactionType.DEPOSIT })
      .getRawOne<{ max: Date | null }>();
  }
}
