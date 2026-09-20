import { Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';

import { WatchSummary } from '../modules/watcher/watcher.types';
import { WatcherService } from '../modules/watcher/watcher.service';

interface WatchCommandOptions {
  dryRun?: boolean;
  blocks?: number;
  loop?: boolean;
  idle?: number;
}

/** TRON 블록 간격. 따라잡은 뒤에는 이 정도만 쉬면 새 블록이 나와 있다 */
const DEFAULT_IDLE_MS = 3000;
/** 연속 실패 시 대기 상한. 노드가 죽어도 로그만 쌓이지 프로세스는 살아 있는다 */
const MAX_BACKOFF_MS = 30000;
/** 조용할 때도 살아 있다는 걸 남기는 주기 */
const HEARTBEAT_MS = 300000;

@Command({
  name: 'tron:watch',
  description:
    '스캔 커서 다음 블록부터 확정 블록까지 훑어 입금을 반영한다. 지갑 수와 무관하게 블록당 1콜. ' +
    '--loop 로 상주 실행(워커)한다. --dry-run 으로 먼저 확인하세요.',
})
export class TronWatchCommand extends CommandRunner {
  private readonly logger = new Logger(TronWatchCommand.name);
  private stopping = false;
  private wake: (() => void) | null = null;

  constructor(private readonly watcher: WatcherService) {
    super();
  }

  async run(_params: string[], options: WatchCommandOptions): Promise<void> {
    if (options.loop) {
      await this.runLoop(options);
      return;
    }

    const summary = await this.watcher.scan({
      dryRun: options.dryRun ?? false,
      maxBlocks: options.blocks,
    });
    this.logger.log('\n' + this.render(summary).join('\n'));
  }

  /**
   * 상주 실행. 밀려 있으면 쉬지 않고 다음 배치로 넘어가고, 따라잡았으면 블록 간격만큼만 쉰다.
   * 주기를 하나로 고정하는 크론과 달리 백로그를 전속력으로 비울 수 있다.
   *
   * 동시 실행 방지는 WatcherService 안의 advisory lock 이 맡는다. 워커가 두 개 뜨거나
   * 사람이 수동으로 tron:watch 를 쳐도 한쪽은 skipped 로 돌아온다.
   */
  private async runLoop(options: WatchCommandOptions): Promise<void> {
    const idleMs = options.idle ?? DEFAULT_IDLE_MS;
    this.listenForShutdown();
    this.logger.log(
      `상주 스캔 시작 (idle ${idleMs}ms, batch ${options.blocks ?? 'SCAN_BLOCK_BATCH'}). ` +
        'Ctrl+C 로 종료합니다.',
    );

    let backoffMs = 0;
    let lastHeartbeat = Date.now();

    while (!this.stopping) {
      try {
        const summary = await this.watcher.scan({
          dryRun: options.dryRun ?? false,
          maxBlocks: options.blocks,
        });
        backoffMs = 0;

        if (summary.skipped) {
          // 다른 스캔이 돌고 있다. 조용히 한 박자 쉬고 다시 본다.
          await this.sleep(idleMs);
          continue;
        }

        if (summary.applied > 0 || summary.remainingBlocks > 0) {
          this.logger.log(this.renderOneLine(summary));
          lastHeartbeat = Date.now();
        } else if (Date.now() - lastHeartbeat >= HEARTBEAT_MS) {
          this.logger.log(this.renderOneLine(summary));
          lastHeartbeat = Date.now();
        }

        // 아직 남았으면 쉬지 않고 이어서 비운다.
        if (summary.remainingBlocks > 0) {
          continue;
        }
        await this.sleep(idleMs);
      } catch (err) {
        // 노드나 DB 가 잠깐 죽었다고 프로세스를 내리면 부팅만 반복해서 태운다.
        // 계속 돌면서 백오프하고, 장애는 remainingBlocks 가 커지는 걸로 감지한다.
        backoffMs = backoffMs === 0 ? 1000 : Math.min(backoffMs * 2, MAX_BACKOFF_MS);
        this.logger.error(`스캔 실패: ${(err as Error).message} → ${backoffMs}ms 후 재시도`);
        await this.sleep(backoffMs);
      }
    }

    this.logger.log('상주 스캔을 종료했습니다.');
  }

  /** 진행 중인 배치는 끝까지 마치고 나간다. 커서와 입금이 한 트랜잭션이라 중간에 끊겨도 안전하다. */
  private listenForShutdown(): void {
    const stop = (signal: string) => () => {
      if (this.stopping) {
        return;
      }
      this.stopping = true;
      this.logger.log(`${signal} 수신 — 진행 중인 배치를 마치고 종료합니다.`);
      this.wake?.();
    };
    process.once('SIGINT', stop('SIGINT'));
    process.once('SIGTERM', stop('SIGTERM'));
  }

  /** 종료 신호가 오면 남은 대기를 건너뛴다 */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.wake = null;
        resolve();
      }, ms);
      this.wake = () => {
        clearTimeout(timer);
        this.wake = null;
        resolve();
      };
    });
  }

  private renderOneLine(summary: WatchSummary): string {
    const range = summary.fromBlock === null ? 'idle' : `${summary.fromBlock}~${summary.toBlock}`;
    return (
      `blocks=${range} solidified=${summary.solidifiedBlock} ` +
      `lag=${summary.remainingBlocks} found=${summary.found} applied=${summary.applied}`
    );
  }

  private render(summary: WatchSummary): string[] {
    if (summary.skipped) {
      return ['다른 스캔이 돌고 있어 건너뛰었습니다.'];
    }

    const range =
      summary.fromBlock === null
        ? '없음 (커서가 확정 블록까지 따라잡음)'
        : `${summary.fromBlock} ~ ${summary.toBlock} (${summary.blocksScanned} blocks)`;

    const lines = [
      `dry-run   : ${summary.dryRun}`,
      `contracts : ${summary.contracts.join(', ') || '-'}`,
      `wallets   : ${summary.wallets}`,
      `blocks    : ${range}`,
      `solidified: ${summary.solidifiedBlock} (남은 블록 ${summary.remainingBlocks})`,
      `found     : ${summary.found} / applied: ${summary.applied}`,
    ];

    if (summary.deposits.length === 0) {
      lines.push('새 입금 없음');
    }
    for (const d of summary.deposits) {
      lines.push(
        `[${summary.dryRun ? 'dry-run' : d.applied ? 'applied' : 'skipped'}] ` +
          `${d.address} +${d.amountFormatted} ${d.symbol}` +
          ` from=${d.from} block=${d.blockNumber} tx=${d.txid}`,
      );
    }

    if (summary.remainingBlocks > 0) {
      lines.push('', '남은 블록이 있습니다. --loop 를 쓰면 다 비울 때까지 이어서 훑습니다.');
    }

    return lines;
  }

  @Option({ flags: '-d, --dry-run', description: 'DB 를 바꾸지 않고 감지 결과만 출력' })
  parseDryRun(): boolean {
    return true;
  }

  @Option({ flags: '-b, --blocks <count>', description: '한 배치에서 훑을 최대 블록 수' })
  parseBlocks(value: string): number {
    const blocks = parseInt(value, 10);
    if (Number.isNaN(blocks) || blocks < 1) {
      throw new Error('blocks 는 1 이상의 정수여야 합니다.');
    }
    return blocks;
  }

  @Option({
    flags: '-l, --loop',
    description: '한 번 훑고 끝내지 않고 상주하며 계속 따라간다 (워커)',
  })
  parseLoop(): boolean {
    return true;
  }

  @Option({
    flags: '-i, --idle <ms>',
    description: `따라잡았을 때 쉬는 시간 (기본 ${DEFAULT_IDLE_MS}ms). --loop 에서만 쓴다`,
  })
  parseIdle(value: string): number {
    const ms = parseInt(value, 10);
    if (Number.isNaN(ms) || ms < 100) {
      throw new Error('idle 은 100 이상의 정수(ms)여야 합니다.');
    }
    return ms;
  }
}
