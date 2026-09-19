import { Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';

import { ScanTrigger } from '../modules/scan/entities/scan-run.entity';
import { WatcherService } from '../modules/watcher/watcher.service';

interface WatchCommandOptions {
  dryRun?: boolean;
}

@Command({
  name: 'tron:watch',
  description:
    'USDT 입금을 1회 스캔해서 user_wallet.usdt_amount 를 올린다. ' +
    'scan_cursor 가 가리키는 시점부터 이어서 훑는다. --dry-run 으로 먼저 확인하세요.',
})
export class TronWatchCommand extends CommandRunner {
  private readonly logger = new Logger(TronWatchCommand.name);

  constructor(private readonly watcher: WatcherService) {
    super();
  }

  async run(_params: string[], options: WatchCommandOptions): Promise<void> {
    const summary = await this.watcher.scan({
      dryRun: options.dryRun ?? false,
      trigger: ScanTrigger.CLI,
    });

    const lines = [
      `dry-run  : ${summary.dryRun}`,
      `contract : ${summary.symbol} (${summary.contract})`,
      `window   : ${summary.windowFrom?.toISOString() ?? '-'} ~ ${summary.windowTo.toISOString()}`,
      `scanned  : ${summary.scanned} wallets` +
        (summary.failed > 0 ? ` (조회 실패 ${summary.failed})` : '') +
        (summary.truncated > 0 ? ` (limit 초과 ${summary.truncated})` : ''),
      `found    : ${summary.found} / applied: ${summary.applied} / pending: ${summary.pending}`,
      `run id   : ${summary.runId ?? '-'}`,
    ];
    if (summary.deposits.length === 0) {
      lines.push('새 입금 없음');
    }
    for (const d of summary.deposits) {
      lines.push(
        `[${summary.dryRun ? 'dry-run' : d.pending ? 'pending' : d.applied ? 'applied' : 'skipped'}] ` +
          `${d.address} +${d.amountFormatted} ${summary.symbol}` +
          ` from=${d.from} tx=${d.txid}`,
      );
    }

    this.logger.log('\n' + lines.join('\n'));
  }

  @Option({ flags: '-d, --dry-run', description: 'DB 를 바꾸지 않고 감지 결과만 출력' })
  parseDryRun(): boolean {
    return true;
  }
}
