export interface WatchOptions {
  dryRun?: boolean;
  /** 이번 실행에서 훑을 최대 블록 수. 생략하면 SCAN_BLOCK_BATCH */
  maxBlocks?: number;
}

export interface BackfillOptions {
  fromBlock: number;
  toBlock: number;
  /** 생략하면 등록된 활성 TRC20 전부 */
  contractId?: string;
  dryRun?: boolean;
}

export interface WatchedDeposit {
  address: string;
  txid: string;
  blockNumber: number;
  logIndex: number;
  contractId: string;
  contract: string;
  symbol: string;
  from: string;
  to: string;
  amount: string;
  amountFormatted: string;
  blockTimestamp: Date;
  /** false 면 이미 기록된 입금이라 잔고를 올리지 않았다 */
  applied: boolean;
}

export interface WatchSummary {
  dryRun: boolean;
  /** true 면 다른 스캔이 돌고 있어 이번엔 아무것도 하지 않았다 */
  skipped: boolean;
  /** 이번 실행이 훑은 블록 구간 (없으면 훑을 게 없었다) */
  fromBlock: number | null;
  toBlock: number | null;
  /** 확정된 최신 블록. toBlock 과의 차이가 밀린 정도다 */
  solidifiedBlock: number;
  /** 아직 남은 블록 수. 0 이 아니면 다음 실행이 이어받는다 */
  remainingBlocks: number;
  blocksScanned: number;
  contracts: string[];
  wallets: number;
  found: number;
  applied: number;
  deposits: WatchedDeposit[];
}

export interface BackfillSummary {
  dryRun: boolean;
  fromBlock: number;
  toBlock: number;
  blocksScanned: number;
  contracts: string[];
  wallets: number;
  found: number;
  applied: number;
  deposits: WatchedDeposit[];
}
