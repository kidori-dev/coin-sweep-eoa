import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum ScanScope {
  DEPOSIT = 'deposit',
  SWEEP = 'sweep',
}

/**
 * "이 시점까지는 빠짐없이 조회했다" 는 경계를 (스코프 × 지갑 × 컨트랙트) 별로 들고 있는다.
 * transactions 에서 MAX(block_timestamp) 를 유추하던 방식과 달리, 입금이 한 건도 없는
 * 지갑도 커서가 전진하므로 조회 윈도가 무한정 넓어지지 않는다.
 */
@Entity('scan_cursor')
@Index('UQ_scan_cursor_target', ['scope', 'userWalletId', 'contract'], { unique: true })
export class ScanCursor {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'enum', enum: ScanScope })
  scope!: ScanScope;

  /** null 이면 지갑 단위가 아닌 전역 커서 */
  @Column({ name: 'user_wallet_id', type: 'uuid', nullable: true })
  userWalletId!: string | null;

  /** null 이면 네이티브 TRX */
  @Column({ type: 'varchar', length: 64, nullable: true })
  contract!: string | null;

  /** 여기까지는 조회가 끝났다. 다음 스캔의 min_timestamp 가 된다 */
  @Column({ name: 'scanned_through_at', type: 'timestamptz' })
  scannedThroughAt!: Date;

  /** 경계에 걸친 마지막 tx. 커서가 inclusive 라 재수신되는 건을 눈으로 확인할 때 쓴다 */
  @Column({ name: 'last_seen_txid', type: 'varchar', length: 64, nullable: true })
  lastSeenTxid!: string | null;

  /** 조회 limit 에 걸려 잘렸다. 남은 구간이 있다는 뜻이고 다음 스캔이 이어받는다 */
  @Column({ type: 'boolean', default: false })
  truncated!: boolean;

  @Column({ name: 'last_run_at', type: 'timestamptz', nullable: true })
  lastRunAt!: Date | null;

  @Column({ name: 'last_success_at', type: 'timestamptz', nullable: true })
  lastSuccessAt!: Date | null;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
