import { TransactionStatus } from '../transactions/entities/transaction.entity';

export enum SweepAsset {
  TRX = 'TRX',
  TOKEN = 'TOKEN',
}

/** 수동 집금에서 contract 자리에 넣는 네이티브 TRX 표식 */
export { NATIVE_REF as NATIVE_TRX } from '../contracts/entities/contract.entity';

export interface SweepOptions {
  dryRun?: boolean;
}

export interface ManualSweepOptions {
  /** 컨트랙트 주소, 또는 네이티브 TRX 표식 "TRX" */
  contract: string;
  address: string;
  dryRun?: boolean;
}

export interface SweepItem {
  address: string;
  asset: SweepAsset;
  contractId: string;
  /** 컨트랙트 주소. 네이티브 TRX 면 null */
  contract: string | null;
  symbol: string;
  amount: string;
  amountFormatted: string;
  status: TransactionStatus;
  txid?: string;
  feeStrategy?: string;
  feeTxid?: string;
  error?: string;
  reason?: string;
}

export interface SweepSummary {
  dryRun: boolean;
  mainAddress: string;
  /** 검사한 (지갑 × 자산) 후보 수. 전체 지갑 수가 아니다 */
  scanned: number;
  items: SweepItem[];
}
