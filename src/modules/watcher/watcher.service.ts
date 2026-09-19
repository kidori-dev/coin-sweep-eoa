import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, EntityManager } from 'typeorm';

import { ScanCursor, ScanScope } from '../scan/entities/scan-cursor.entity';
import { ScanTrigger } from '../scan/entities/scan-run.entity';
import { ScanCursorService } from '../scan/scan-cursor.service';
import { ScanRunService } from '../scan/scan-run.service';
import { TransactionStatus, TransactionType } from '../transactions/entities/transaction.entity';
import { TransactionsService } from '../transactions/transactions.service';
import { TokenMeta, TronService, Trc20Transfer } from '../tron/tron.service';
import { UserWallet } from '../user-wallets/entities/user-wallet.entity';
import { formatUnits } from '../user-wallets/units';
import { UserWalletsService } from '../user-wallets/user-wallets.service';
import { WalletScanResult, WatchedDeposit, WatchOptions, WatchSummary } from './watcher.types';

@Injectable()
export class WatcherService {
  private readonly logger = new Logger(WatcherService.name);
  private readonly confirmLagMs: number;
  private readonly pageLimit: number;

  constructor(
    private readonly wallets: UserWalletsService,
    private readonly transactions: TransactionsService,
    private readonly tron: TronService,
    private readonly cursors: ScanCursorService,
    private readonly runs: ScanRunService,
    private readonly dataSource: DataSource,
    config: ConfigService,
  ) {
    this.confirmLagMs = config.get<number>('scan.confirmLagMs')!;
    this.pageLimit = config.get<number>('scan.pageLimit')!;
  }

  async scan(options: WatchOptions = {}): Promise<WatchSummary> {
    const contract = this.tron.defaultToken;
    const meta = await this.tron.getTokenMeta(contract);
    const dryRun = options.dryRun ?? false;
    const targets = await this.wallets.findActive();

    // 확정 지연 버퍼. 이 시각 이후의 전송은 인덱싱이 흔들릴 수 있어 다음 실행으로 미룬다.
    const windowTo = new Date(Date.now() - this.confirmLagMs);

    const run = dryRun
      ? null
      : await this.runs.start({
          scope: ScanScope.DEPOSIT,
          trigger: options.trigger ?? ScanTrigger.API,
          dryRun,
          contract,
          windowTo,
        });

    const deposits: WatchedDeposit[] = [];
    const errors: string[] = [];
    let applied = 0;
    let pending = 0;
    let truncated = 0;
    let windowFrom: Date | null = null;

    try {
      for (const wallet of targets) {
        const cursor = await this.cursors.loadOrCreate(
          { scope: ScanScope.DEPOSIT, userWalletId: wallet.id, contract },
          wallet.createdAt,
        );
        if (!windowFrom || cursor.scannedThroughAt < windowFrom) {
          windowFrom = cursor.scannedThroughAt;
        }

        try {
          const result = await this.scanWallet(wallet, cursor, contract, meta, windowTo, dryRun);
          deposits.push(...result.deposits);
          applied += result.applied;
          pending += result.pending;
          truncated += result.truncated ? 1 : 0;
        } catch (err) {
          // 한 지갑이 막혔다고 나머지를 못 보면 안 된다. 커서는 그대로 두고 다음 실행이 재시도한다.
          const message = (err as Error).message;
          errors.push(`${wallet.address}: ${message}`);
          this.logger.error(`입금 조회 실패 ${wallet.address}: ${message}`);
          if (!dryRun) {
            await this.cursors.markFailed(cursor.id, message);
          }
        }
      }
    } catch (err) {
      if (run) {
        await this.runs.fail(run.id, (err as Error).message, {
          walletsScanned: targets.length,
          found: deposits.length,
          applied,
          pending,
          failed: errors.length,
        });
      }
      throw err;
    }

    if (run) {
      const counts = {
        walletsScanned: targets.length,
        found: deposits.length,
        applied,
        pending,
        failed: errors.length,
        windowFrom,
        windowTo,
      };
      if (errors.length > 0) {
        await this.runs.fail(
          run.id,
          `${errors.length}개 지갑 조회 실패\n${errors.join('\n')}`,
          counts,
        );
      } else {
        await this.runs.finish(run.id, counts);
      }
    }

    return {
      dryRun,
      contract,
      symbol: meta.symbol,
      scanned: targets.length,
      found: deposits.length,
      applied,
      pending,
      failed: errors.length,
      truncated,
      windowFrom,
      windowTo,
      runId: run?.id ?? null,
      deposits,
    };
  }

  private async scanWallet(
    wallet: UserWallet,
    cursor: ScanCursor,
    contract: string,
    meta: TokenMeta,
    windowTo: Date,
    dryRun: boolean,
  ): Promise<WalletScanResult> {
    const transfers = await this.tron.getIncomingTrc20(
      wallet.address,
      contract,
      cursor.scannedThroughAt.getTime(),
      this.pageLimit,
    );

    // 응답이 limit 을 꽉 채웠으면 그 뒤가 더 있을 수 있다. 커서를 끝까지 밀면 그만큼 유실된다.
    const truncated = transfers.length >= this.pageLimit;
    const ready = transfers.filter((transfer) => transfer.blockTimestamp <= windowTo.getTime());
    const deferred = transfers.length - ready.length;

    const deposits = transfers.map<WatchedDeposit>((transfer) => ({
      address: wallet.address,
      txid: transfer.txid,
      contract,
      from: transfer.from,
      to: transfer.to,
      amount: transfer.amount.toString(),
      amountFormatted: formatUnits(transfer.amount, meta.decimals),
      blockTimestamp: new Date(transfer.blockTimestamp),
      applied: false,
      pending: transfer.blockTimestamp > windowTo.getTime(),
    }));

    if (dryRun) {
      return { deposits, applied: 0, pending: deferred, truncated };
    }

    const nextAt = this.nextCursorAt(cursor, ready, truncated || deferred > 0, windowTo);
    const lastSeenTxid = ready.length > 0 ? ready[ready.length - 1].txid : cursor.lastSeenTxid;

    // 입금 반영과 커서 전진을 한 트랜잭션에 묶는다. 따로 커밋하면 그 사이에 죽었을 때
    // 커서만 앞서 나가 입금 한 건이 영영 반영되지 않는 창이 생긴다.
    const appliedTxids = await this.dataSource.transaction(async (manager) => {
      const done = new Set<string>();
      for (const transfer of ready) {
        if (await this.apply(manager, wallet, contract, meta, transfer)) {
          done.add(transfer.txid);
        }
      }
      await this.cursors.advance(manager, cursor.id, {
        scannedThroughAt: nextAt,
        lastSeenTxid,
        truncated,
      });
      return done;
    });

    for (const deposit of deposits) {
      deposit.applied = appliedTxids.has(deposit.txid);
      if (deposit.applied) {
        this.logger.log(
          `입금 감지 ${wallet.address} +${deposit.amountFormatted} ${meta.symbol} (${deposit.txid})`,
        );
      }
    }

    return { deposits, applied: appliedTxids.size, pending: deferred, truncated };
  }

  /**
   * 남은 구간이 있으면 마지막으로 처리한 건까지만, 다 훑었으면 확정 버퍼 경계까지 전진한다.
   * 후자가 핵심이다 — 입금이 한 건도 없는 지갑도 커서가 움직여 조회 윈도가 넓어지지 않는다.
   */
  private nextCursorAt(
    cursor: ScanCursor,
    ready: Trc20Transfer[],
    hasMore: boolean,
    windowTo: Date,
  ): Date {
    if (!hasMore) {
      return windowTo > cursor.scannedThroughAt ? windowTo : cursor.scannedThroughAt;
    }

    if (ready.length === 0) {
      return cursor.scannedThroughAt;
    }

    const next = new Date(ready[ready.length - 1].blockTimestamp);
    if (next <= cursor.scannedThroughAt) {
      // 같은 timestamp 에 limit 을 넘는 전송이 몰린 경우. 그냥 두면 같은 구간만 반복한다.
      this.logger.warn(
        `커서가 전진하지 못했습니다 (cursor=${cursor.id}, at=${next.toISOString()}). ` +
          'SCAN_PAGE_LIMIT 을 올리거나 해당 구간을 수동 확인하세요.',
      );
    }
    return next;
  }

  private async apply(
    manager: EntityManager,
    wallet: UserWallet,
    contract: string,
    meta: TokenMeta,
    transfer: Trc20Transfer,
  ): Promise<boolean> {
    const isNew = await this.transactions.recordOnce(manager, {
      userWalletId: wallet.id,
      type: TransactionType.DEPOSIT,
      status: TransactionStatus.SUCCESS,
      address: wallet.address,
      contract,
      tokenSymbol: meta.symbol,
      tokenDecimals: meta.decimals,
      txid: transfer.txid,
      fromAddress: transfer.from,
      toAddress: transfer.to,
      amount: transfer.amount,
      blockTimestamp: new Date(transfer.blockTimestamp),
    });

    // 이미 기록된 입금이면 잔고를 건드리지 않는다. 커서를 과거로 되감아 같은 구간을
    // 다시 훑어도 (txid, user_wallet_id) 유니크 인덱스가 막아 이중 반영되지 않는다.
    if (!isNew) {
      return false;
    }

    await manager
      .createQueryBuilder()
      .update(UserWallet)
      .set({ usdtAmount: () => 'usdt_amount + :amount' })
      .where('id = :id', { id: wallet.id })
      .setParameters({ amount: transfer.amount.toString() })
      .execute();

    return true;
  }
}
