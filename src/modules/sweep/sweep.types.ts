import { ScanTrigger } from '../scan/entities/scan-run.entity';
import { TransactionStatus } from '../transactions/entities/transaction.entity';

export enum SweepAsset {
  TRX = 'TRX',
  TOKEN = 'TOKEN',
}

/** 수동 집금에서 contract 자리에 넣는 네이티브 TRX 표식 */
export const NATIVE_TRX = 'TRX';

export interface SweepOptions {
  dryRun?: boolean;
  trigger?: ScanTrigger;
}

export interface ManualSweepOptions {
  contract: string;
  address: string;
  dryRun?: boolean;
  trigger?: ScanTrigger;
}

export interface SweepItem {
  address: string;
  asset: SweepAsset;
  contract: string | null;
  amount: string;
  amountFormatted?: string;
  symbol?: string;
  status: TransactionStatus;
  txid?: string;
  feeStrategy?: string;
  feeTxid?: string;
  error?: string;
  reason?: string;
}

export type SweepItemView = SweepItem & { amountFormatted: string; symbol: string };

export interface SweepSummary {
  dryRun: boolean;
  mainAddress: string;
  contract: string;
  scanned: number;
  runId: string | null;
  items: SweepItemView[];
}
