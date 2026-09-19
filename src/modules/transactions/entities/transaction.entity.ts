import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export enum TransactionType {
  DEPOSIT = 'deposit',
  SWEEP = 'sweep',
}

export enum TransactionStatus {
  SUCCESS = 'success',
  FAILED = 'failed',
  SKIPPED = 'skipped',
}

@Entity('transactions')
@Index('UQ_transactions_tx', ['txid', 'userWalletId'], { unique: true })
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'user_wallet_id', type: 'uuid' })
  userWalletId!: string;

  @Column({ type: 'enum', enum: TransactionType })
  type!: TransactionType;

  @Column({ type: 'enum', enum: TransactionStatus })
  status!: TransactionStatus;

  @Column({ type: 'varchar', length: 64 })
  address!: string;

  /** null 이면 네이티브 TRX */
  @Column({ type: 'varchar', length: 64, nullable: true })
  contract!: string | null;

  @Column({ name: 'token_symbol', type: 'varchar', length: 32 })
  tokenSymbol!: string;

  @Column({ name: 'token_decimals', type: 'integer' })
  tokenDecimals!: number;

  @Index()
  @Column({ type: 'varchar', length: 64, nullable: true })
  txid!: string | null;

  @Column({ name: 'from_address', type: 'varchar', length: 64 })
  fromAddress!: string;

  @Column({ name: 'to_address', type: 'varchar', length: 64 })
  toAddress!: string;

  @Column({ type: 'numeric', precision: 38, scale: 0 })
  amount!: string;

  @Column({ name: 'fee_strategy', type: 'varchar', length: 16, nullable: true })
  feeStrategy!: string | null;

  @Column({ name: 'fee_txid', type: 'varchar', length: 64, nullable: true })
  feeTxid!: string | null;

  @Column({ type: 'text', nullable: true })
  error!: string | null;

  /** 입금만 채워진다. 집금은 체인 조회를 더 하지 않는다. */
  @Column({ name: 'block_timestamp', type: 'timestamptz', nullable: true })
  blockTimestamp!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
