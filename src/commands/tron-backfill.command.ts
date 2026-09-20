import { Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';

import { ContractsService } from '../modules/contracts/contracts.service';
import { WatcherService } from '../modules/watcher/watcher.service';

interface BackfillCommandOptions {
  from: number;
  to: number;
  contract?: string;
  dryRun?: boolean;
}

@Command({
  name: 'tron:backfill',
  description:
    '지정한 블록 구간을 다시 훑는다. 스캔 커서를 건드리지 않으므로 오래 걸려도 신규 입금 ' +
    '감지가 멈추지 않는다. 새 토큰의 과거 입금을 채우거나 누락을 복구할 때 쓴다. ' +
    '예) tron:backfill -f 71000000 -t 71100000 -c TR7NHq...',
})
export class TronBackfillCommand extends CommandRunner {
  private readonly logger = new Logger(TronBackfillCommand.name);

  constructor(
    private readonly watcher: WatcherService,
    private readonly contracts: ContractsService,
  ) {
    super();
  }

  async run(_params: string[], options: BackfillCommandOptions): Promise<void> {
    const contract = options.contract ? await this.contracts.resolveOrFail(options.contract) : null;

    const summary = await this.watcher.backfill({
      fromBlock: options.from,
      toBlock: options.to,
      contractId: contract?.id,
      dryRun: options.dryRun ?? false,
    });

    const lines = [
      `dry-run   : ${summary.dryRun}`,
      `contracts : ${summary.contracts.join(', ')}`,
      `wallets   : ${summary.wallets}`,
      `blocks    : ${summary.fromBlock} ~ ${summary.toBlock} (${summary.blocksScanned} blocks)`,
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

    this.logger.log('\n' + lines.join('\n'));
  }

  @Option({ flags: '-f, --from <block>', description: '시작 블록 (포함)', required: true })
  parseFrom(value: string): number {
    return parseBlock(value, 'from');
  }

  @Option({ flags: '-t, --to <block>', description: '끝 블록 (포함)', required: true })
  parseTo(value: string): number {
    return parseBlock(value, 'to');
  }

  @Option({
    flags: '-c, --contract <address>',
    description: '특정 컨트랙트만. 없으면 등록된 활성 TRC20 전부',
  })
  parseContract(value: string): string {
    return value;
  }

  @Option({ flags: '-d, --dry-run', description: 'DB 를 바꾸지 않고 감지 결과만 출력' })
  parseDryRun(): boolean {
    return true;
  }
}

function parseBlock(value: string, name: string): number {
  const block = parseInt(value, 10);
  if (Number.isNaN(block) || block < 0) {
    throw new Error(`${name} 은 0 이상의 정수여야 합니다.`);
  }
  return block;
}
