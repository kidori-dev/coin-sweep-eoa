import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { Contract } from '../../contracts/entities/contract.entity';

export enum TransactionType {
  DEPOSIT = 'deposit',
  SWEEP = 'sweep',
}

export enum TransactionStatus {
  SUCCESS = 'success',
  FAILED = 'failed',
  SKIPPED = 'skipped',
}

/** pg 드라이버가 bigint 를 문자열로 돌려주므로 블록 번호는 숫자로 변환해서 쓴다 */
const blockNumberTransformer = {
  to: (value: number | null): number | null => value,
  from: (value: string | null): number | null => (value === null ? null : Number(value)),
};

/**
 * 입금과 집금을 한 테이블에 담는다.
 *
 * 입금 중복 반영을 막는 건 마이그레이션이 거는 부분 유니크 인덱스다:
 *   UQ_transactions_deposit : (txid, user_wallet_id, contract_id, log_index) WHERE type = 'deposit'
 *
 * 한 트랜잭션이 같은 주소로 서로 다른 토큰을 보내거나 같은 토큰을 두 번 보낼 수 있어서
 * txid + 지갑만으로는 두 번째 건이 조용히 사라진다. log_index 까지 키에 넣어야 한다.
 * 집금은 append-only 라 제약을 걸지 않는다 (실패 건은 txid 자체가 없다).
 */
@Entity('transactions')
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

  @Index()
  @Column({ name: 'contract_id', type: 'uuid' })
  contractId!: string;

  @ManyToOne(() => Contract, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'contract_id' })
  contract!: Contract;

  /**
   * 기록 시점의 메타데이터 스냅샷. contract 행을 나중에 고쳐도 과거 이력의 표시 금액이
   * 따라 움직이면 안 되므로 FK 와 별개로 굳혀 둔다.
   */
  @Column({ name: 'token_symbol', type: 'varchar', length: 32 })
  tokenSymbol!: string;

  @Column({ name: 'token_decimals', type: 'integer' })
  tokenDecimals!: number;

  @Index()
  @Column({ type: 'varchar', length: 64, nullable: true })
  txid!: string | null;

  /** 입금만 채워진다. 어느 블록의 몇 번째 로그였는지 */
  @Column({
    name: 'block_number',
    type: 'bigint',
    nullable: true,
    transformer: blockNumberTransformer,
  })
  blockNumber!: number | null;

  @Column({ name: 'log_index', type: 'integer', nullable: true })
  logIndex!: number | null;

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
