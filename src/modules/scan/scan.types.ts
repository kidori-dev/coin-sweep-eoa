import { ScanScope } from './entities/scan-cursor.entity';
import { ScanRunStatus, ScanTrigger } from './entities/scan-run.entity';

/** 커서 한 행을 가리키는 키. userWalletId 가 null 이면 전역, contract 가 null 이면 네이티브 TRX */
export interface CursorTarget {
  scope: ScanScope;
  userWalletId?: string | null;
  contract?: string | null;
}

export interface AdvanceCursorInput {
  scannedThroughAt: Date;
  lastSeenTxid?: string | null;
  truncated?: boolean;
}

export interface RewindCursorInput {
  scope: ScanScope;
  to: Date;
  /** 생략하면 스코프 전체. null 이면 전역 커서만 */
  userWalletId?: string | null;
  contract?: string | null;
}

export interface StartRunInput {
  scope: ScanScope;
  trigger?: ScanTrigger;
  dryRun?: boolean;
  contract?: string | null;
  windowFrom?: Date | null;
  windowTo?: Date | null;
}

export interface FinishRunInput {
  walletsScanned?: number;
  found?: number;
  applied?: number;
  pending?: number;
  failed?: number;
  windowFrom?: Date | null;
  windowTo?: Date | null;
}

export interface FindRunsOptions {
  scope?: ScanScope;
  status?: ScanRunStatus;
  limit?: number;
}
