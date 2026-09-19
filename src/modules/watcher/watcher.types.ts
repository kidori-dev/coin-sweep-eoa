import { ScanTrigger } from '../scan/entities/scan-run.entity';

export interface WatchOptions {
  dryRun?: boolean;
  trigger?: ScanTrigger;
}

export interface WatchedDeposit {
  address: string;
  txid: string;
  contract: string;
  from: string;
  to: string;
  amount: string;
  amountFormatted: string;
  blockTimestamp: Date;
  applied: boolean;
  /** 확정 지연 버퍼(SCAN_CONFIRM_LAG_MS) 안쪽이라 이번엔 반영하지 않고 미뤘다 */
  pending: boolean;
}

export interface WatchSummary {
  dryRun: boolean;
  contract: string;
  symbol: string;
  scanned: number;
  found: number;
  applied: number;
  pending: number;
  failed: number;
  truncated: number;
  windowFrom: Date | null;
  windowTo: Date;
  runId: string | null;
  deposits: WatchedDeposit[];
}

export interface WalletScanResult {
  deposits: WatchedDeposit[];
  applied: number;
  pending: number;
  truncated: boolean;
}
