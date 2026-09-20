import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, EntityManager } from 'typeorm';

import { ContractsService } from '../contracts/contracts.service';
import { Contract } from '../contracts/entities/contract.entity';
import { TransactionStatus, TransactionType } from '../transactions/entities/transaction.entity';
import { TransactionsService } from '../transactions/transactions.service';
import { fromHexAddress, toHexAddress, Trc20Transfer, TronService } from '../tron/tron.service';
import { UserWallet } from '../user-wallets/entities/user-wallet.entity';
import { formatUnits } from '../user-wallets/units';
import { UserWalletsService } from '../user-wallets/user-wallets.service';
import { ScanStateService } from './scan-state.service';
import {
  BackfillOptions,
  BackfillSummary,
  WatchedDeposit,
  WatchOptions,
  WatchSummary,
} from './watcher.types';

interface Hit {
  transfer: Trc20Transfer;
  wallet: UserWallet;
  contract: Contract;
}

interface WalkResult {
  deposits: WatchedDeposit[];
  applied: number;
}

/**
 * 블록을 하나씩 훑어 우리 입금주소로 들어온 TRC20 전송을 찾는다.
 *
 * 지갑마다 TronGrid 계정 조회를 쏘던 방식은 호출 수가 지갑 수에 비례해서 수백 개만 넘어도
 * 한 바퀴를 못 돈다. 블록 기준이면 **지갑이 몇 개든 블록당 1콜**이고, 그 한 번의 응답에
 * 모든 컨트랙트의 로그가 다 들어 있어 등록된 토큰이 늘어도 호출이 늘지 않는다.
 *
 * 스캔 위치는 chain_scan_state 한 행이 들고 있다. 과거 구간을 다시 훑는 일(backfill)은
 * 그 커서를 건드리지 않아서, 오래 걸리는 백필이 돌아도 신규 입금 감지가 멈추지 않는다.
 */
@Injectable()
export class WatcherService {
  private readonly logger = new Logger(WatcherService.name);
  private readonly blockBatch: number;
  private readonly blockConcurrency: number;

  constructor(
    private readonly wallets: UserWalletsService,
    private readonly transactions: TransactionsService,
    private readonly tron: TronService,
    private readonly contracts: ContractsService,
    private readonly scanState: ScanStateService,
    private readonly dataSource: DataSource,
    config: ConfigService,
  ) {
    this.blockBatch = config.get<number>('scan.blockBatch')!;
    this.blockConcurrency = config.get<number>('scan.blockConcurrency')!;
  }

  /**
   * 커서 다음 블록부터 확정 블록까지. 커서를 전진시킨다.
   * 동시에 두 개가 돌지 않도록 advisory lock 으로 묶는다 — 못 잡으면 skipped 로 돌아온다.
   */
  async scan(options: WatchOptions = {}): Promise<WatchSummary> {
    const summary = await this.scanState.withScanLock(() => this.scanLocked(options));
    return summary ?? this.idleSummary(options.dryRun ?? false, [], 0, true);
  }

  private async scanLocked(options: WatchOptions): Promise<WatchSummary> {
    const dryRun = options.dryRun ?? false;
    const [contracts, solidifiedBlock] = await Promise.all([
      this.contracts.findActiveTokens(),
      this.tron.getSolidifiedBlockNumber(),
    ]);
    const symbols = contracts.map((contract) => contract.symbol);

    if (contracts.length === 0) {
      this.logger.warn('감시할 컨트랙트가 없습니다. `tron:contract-add` 로 TRC20 을 등록하세요.');
      return this.idleSummary(dryRun, symbols, solidifiedBlock, false);
    }

    // 첫 실행이면 현재 확정 블록에서 시작한다. 과거는 backfill 로 따로 훑는다.
    const state = await this.scanState.loadOrCreate(solidifiedBlock);
    const fromBlock = state.lastScannedBlock + 1;
    if (fromBlock > solidifiedBlock) {
      return this.idleSummary(dryRun, symbols, solidifiedBlock, false);
    }

    const toBlock = Math.min(
      solidifiedBlock,
      fromBlock + (options.maxBlocks ?? this.blockBatch) - 1,
    );
    const wallets = await this.wallets.findActive();
    const result = await this.walk(fromBlock, toBlock, contracts, wallets, dryRun, true);

    return {
      dryRun,
      skipped: false,
      solidifiedBlock,
      contracts: symbols,
      fromBlock,
      toBlock,
      remainingBlocks: solidifiedBlock - toBlock,
      blocksScanned: toBlock - fromBlock + 1,
      wallets: wallets.length,
      found: result.deposits.length,
      applied: result.applied,
      deposits: result.deposits,
    };
  }

  /** 훑을 게 없었거나 락을 못 잡았을 때의 빈 요약 */
  private idleSummary(
    dryRun: boolean,
    contracts: string[],
    solidifiedBlock: number,
    skipped: boolean,
  ): WatchSummary {
    return {
      dryRun,
      skipped,
      solidifiedBlock,
      contracts,
      fromBlock: null,
      toBlock: null,
      remainingBlocks: 0,
      blocksScanned: 0,
      wallets: 0,
      found: 0,
      applied: 0,
      deposits: [],
    };
  }

  /**
   * 지정한 구간만 다시 훑는다. **커서를 건드리지 않으므로** 오래 걸려도 신규 입금 감지가
   * 멈추지 않는다. 이미 기록된 입금은 유니크 인덱스가 막아 이중 반영되지 않는다.
   */
  async backfill(options: BackfillOptions): Promise<BackfillSummary> {
    const dryRun = options.dryRun ?? false;
    if (options.toBlock < options.fromBlock) {
      throw new Error(`구간이 뒤집혔습니다: ${options.fromBlock} ~ ${options.toBlock}`);
    }

    const all = await this.contracts.findActiveTokens();
    const contracts = options.contractId
      ? all.filter((contract) => contract.id === options.contractId)
      : all;
    if (contracts.length === 0) {
      throw new Error('백필 대상 컨트랙트가 없습니다. 등록되어 있고 활성인지 확인하세요.');
    }

    const wallets = await this.wallets.findActive();
    const result = await this.walk(
      options.fromBlock,
      options.toBlock,
      contracts,
      wallets,
      dryRun,
      false,
    );

    return {
      dryRun,
      fromBlock: options.fromBlock,
      toBlock: options.toBlock,
      blocksScanned: options.toBlock - options.fromBlock + 1,
      contracts: contracts.map((contract) => contract.symbol),
      wallets: wallets.length,
      found: result.deposits.length,
      applied: result.applied,
      deposits: result.deposits,
    };
  }

  /**
   * 구간을 청크로 끊어 병렬로 받고, 반영은 블록 순서대로 한다.
   * advanceCursor 가 true 면 청크마다 입금 반영과 커서 전진을 한 트랜잭션에 묶는다.
   */
  private async walk(
    fromBlock: number,
    toBlock: number,
    contracts: Contract[],
    wallets: UserWallet[],
    dryRun: boolean,
    advanceCursor: boolean,
  ): Promise<WalkResult> {
    const walletByHex = new Map(wallets.map((w) => [toHexAddress(w.address), w]));
    const contractByHex = new Map(contracts.map((c) => [toHexAddress(c.address!), c]));

    const deposits: WatchedDeposit[] = [];
    let applied = 0;

    for (let start = fromBlock; start <= toBlock; start += this.blockConcurrency) {
      const chunk: number[] = [];
      for (let n = start; n <= Math.min(start + this.blockConcurrency - 1, toBlock); n += 1) {
        chunk.push(n);
      }

      const fetched = await Promise.all(chunk.map((n) => this.tron.getBlockTransfers(n)));
      const matched = fetched
        .flat()
        .map((transfer) => this.match(transfer, walletByHex, contractByHex))
        .filter((hit): hit is Hit => hit !== null);

      const views = matched.map((hit) => this.toView(hit));
      deposits.push(...views);

      if (dryRun) {
        continue;
      }

      // 입금 반영과 커서 전진을 한 트랜잭션에 묶는다. 따로 커밋하면 그 사이에 죽었을 때
      // 커서만 앞서 나가 입금 한 건이 영영 반영되지 않는 창이 생긴다.
      const lastBlock = chunk[chunk.length - 1];
      const appliedKeys = await this.dataSource.transaction(async (manager) => {
        const done = new Set<string>();
        for (const hit of matched) {
          if (await this.apply(manager, hit)) {
            done.add(key(hit.transfer));
          }
        }
        if (advanceCursor) {
          await this.scanState.advance(manager, lastBlock);
        }
        return done;
      });

      for (const view of views) {
        if (appliedKeys.has(`${view.txid}:${view.logIndex}`)) {
          view.applied = true;
          this.logger.log(
            `입금 감지 ${view.address} +${view.amountFormatted} ${view.symbol} (${view.txid})`,
          );
        }
      }
      applied += appliedKeys.size;
    }

    return { deposits, applied };
  }

  /** 전송 한 건이 우리 지갑·우리 컨트랙트로 들어온 것인지 본다 */
  private match(
    transfer: Trc20Transfer,
    walletByHex: Map<string, UserWallet>,
    contractByHex: Map<string, Contract>,
  ): Hit | null {
    const contract = contractByHex.get(transfer.contractHex);
    if (!contract) {
      return null;
    }
    const wallet = walletByHex.get(transfer.toHex);
    if (!wallet) {
      return null;
    }
    return { transfer, wallet, contract };
  }

  private toView(hit: Hit): WatchedDeposit {
    const { transfer, wallet, contract } = hit;
    return {
      address: wallet.address,
      txid: transfer.txid,
      blockNumber: transfer.blockNumber,
      logIndex: transfer.logIndex,
      contractId: contract.id,
      contract: contract.address!,
      symbol: contract.symbol,
      from: fromHexAddress(transfer.fromHex),
      to: wallet.address,
      amount: transfer.amount.toString(),
      amountFormatted: formatUnits(transfer.amount, contract.decimals),
      blockTimestamp: new Date(transfer.blockTimestamp),
      applied: false,
    };
  }

  private async apply(manager: EntityManager, hit: Hit): Promise<boolean> {
    const { transfer, wallet, contract } = hit;

    const isNew = await this.transactions.recordOnce(manager, {
      userWalletId: wallet.id,
      type: TransactionType.DEPOSIT,
      status: TransactionStatus.SUCCESS,
      address: wallet.address,
      contract,
      txid: transfer.txid,
      blockNumber: transfer.blockNumber,
      logIndex: transfer.logIndex,
      fromAddress: fromHexAddress(transfer.fromHex),
      toAddress: wallet.address,
      amount: transfer.amount,
      blockTimestamp: new Date(transfer.blockTimestamp),
    });

    // 이미 기록된 입금이면 잔고를 건드리지 않는다. 같은 구간을 다시 훑어도
    // (txid, 지갑, 컨트랙트, log_index) 유니크가 막아 이중 반영되지 않는다.
    if (!isNew) {
      return false;
    }

    await this.wallets.credit(manager, wallet.id, contract.id, transfer.amount);
    return true;
  }
}

function key(transfer: Trc20Transfer): string {
  return `${transfer.txid}:${transfer.logIndex}`;
}
