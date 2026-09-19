import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

import { ScanScope } from './scan-cursor.entity';

export enum ScanRunStatus {
  RUNNING = 'running',
  SUCCESS = 'success',
  FAILED = 'failed',
}

export enum ScanTrigger {
  API = 'api',
  CLI = 'cli',
}

/**
 * 스캔·집금 실행 1회의 기록. "입금이 없었다" 와 "워처가 3시간 죽어 있었다" 를 구분하려면
 * 결과 행(transactions)만으로는 부족해서 실행 자체를 남긴다.
 */
@Entity('scan_run')
@Index('IDX_scan_run_scope_started', ['scope', 'startedAt'])
export class ScanRun {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'enum', enum: ScanScope })
  scope!: ScanScope;

  @Column({ type: 'enum', enum: ScanRunStatus, default: ScanRunStatus.RUNNING })
  status!: ScanRunStatus;

  @Column({ type: 'enum', enum: ScanTrigger, default: ScanTrigger.API })
  trigger!: ScanTrigger;

  @Column({ name: 'dry_run', type: 'boolean', default: false })
  dryRun!: boolean;

  @Column({ type: 'varchar', length: 64, nullable: true })
  contract!: string | null;

  /** 이번 실행이 다룬 시간 구간. 집금은 커서가 없으므로 비어 있다 */
  @Column({ name: 'window_from', type: 'timestamptz', nullable: true })
  windowFrom!: Date | null;

  @Column({ name: 'window_to', type: 'timestamptz', nullable: true })
  windowTo!: Date | null;

  @Column({ name: 'wallets_scanned', type: 'integer', default: 0 })
  walletsScanned!: number;

  /** 감지 건수 (입금) / 집금 대상 건수 */
  @Column({ type: 'integer', default: 0 })
  found!: number;

  /** 실제로 반영된 건수 */
  @Column({ type: 'integer', default: 0 })
  applied!: number;

  /** 확정 지연 버퍼에 걸려 다음 실행으로 미룬 건수 */
  @Column({ type: 'integer', default: 0 })
  pending!: number;

  @Column({ type: 'integer', default: 0 })
  failed!: number;

  @Column({ type: 'text', nullable: true })
  error!: string | null;

  @CreateDateColumn({ name: 'started_at', type: 'timestamptz' })
  startedAt!: Date;

  @Column({ name: 'finished_at', type: 'timestamptz', nullable: true })
  finishedAt!: Date | null;
}
