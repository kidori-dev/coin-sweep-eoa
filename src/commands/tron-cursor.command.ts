import { Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';

import { ScanScope } from '../modules/scan/entities/scan-cursor.entity';
import { ScanCursorService } from '../modules/scan/scan-cursor.service';
import { ScanRunService } from '../modules/scan/scan-run.service';
import { UserWalletsService } from '../modules/user-wallets/user-wallets.service';

interface CursorListOptions {
  runs?: number;
}

@Command({
  name: 'tron:cursor',
  description: '스캔 커서와 최근 실행 이력을 본다. "여기까지 조회 완료" 경계를 확인할 때.',
})
export class TronCursorCommand extends CommandRunner {
  private readonly logger = new Logger(TronCursorCommand.name);

  constructor(
    private readonly cursors: ScanCursorService,
    private readonly runs: ScanRunService,
    private readonly wallets: UserWalletsService,
  ) {
    super();
  }

  async run(_params: string[], options: CursorListOptions): Promise<void> {
    const [cursors, wallets] = await Promise.all([this.cursors.findAll(), this.wallets.findAll()]);
    const addressById = new Map(wallets.map((wallet) => [wallet.id, wallet.address]));

    const lines = [`cursors (${cursors.length})`];
    for (const cursor of cursors) {
      const target = cursor.userWalletId
        ? (addressById.get(cursor.userWalletId) ?? cursor.userWalletId)
        : '(global)';
      lines.push(
        `  ${cursor.scope} ${target} ${cursor.contract ?? 'TRX'} ` +
          `→ ${cursor.scannedThroughAt.toISOString()}` +
          (cursor.truncated ? ' [truncated]' : '') +
          (cursor.lastError ? ` [error: ${cursor.lastError}]` : ''),
      );
    }

    const runs = await this.runs.findAll({ limit: options.runs ?? 10 });
    lines.push('', `recent runs (${runs.length})`);
    for (const run of runs) {
      lines.push(
        `  ${run.startedAt.toISOString()} ${run.scope} ${run.status}` +
          (run.dryRun ? ' (dry-run)' : '') +
          ` wallets=${run.walletsScanned} found=${run.found} applied=${run.applied}` +
          ` pending=${run.pending} failed=${run.failed}` +
          (run.error ? `\n    error: ${run.error.split('\n')[0]}` : ''),
      );
    }

    this.logger.log('\n' + lines.join('\n'));
  }

  @Option({ flags: '-r, --runs <count>', description: '함께 출력할 실행 이력 수 (기본 10)' })
  parseRuns(value: string): number {
    const count = Number(value);
    if (Number.isNaN(count) || count <= 0) {
      throw new Error('runs 는 0보다 큰 숫자여야 합니다.');
    }
    return count;
  }
}

interface CursorRewindOptions {
  to: Date;
  address?: string;
  contract?: string;
  scope?: ScanScope;
}

@Command({
  name: 'tron:cursor-rewind',
  description:
    '스캔 커서를 과거로 되감아 그 구간을 다시 훑게 한다. 이미 기록된 입금은 txid 유니크 ' +
    '인덱스에 걸려 다시 반영되지 않는다. 예) tron:cursor-rewind -t 2026-09-01T00:00:00Z',
})
export class TronCursorRewindCommand extends CommandRunner {
  private readonly logger = new Logger(TronCursorRewindCommand.name);

  constructor(
    private readonly cursors: ScanCursorService,
    private readonly wallets: UserWalletsService,
  ) {
    super();
  }

  async run(_params: string[], options: CursorRewindOptions): Promise<void> {
    const wallet = options.address ? await this.wallets.findByAddressOrFail(options.address) : null;

    const affected = await this.cursors.rewind({
      scope: options.scope ?? ScanScope.DEPOSIT,
      to: options.to,
      userWalletId: wallet ? wallet.id : undefined,
      contract: options.contract ?? undefined,
    });

    this.logger.log(
      `커서 ${affected}개를 ${options.to.toISOString()} 로 되감았습니다. ` +
        'tron:watch 를 실행하면 해당 구간을 다시 조회합니다.',
    );
  }

  @Option({
    flags: '-t, --to <iso>',
    description: '되감을 시각 (ISO 8601)',
    required: true,
  })
  parseTo(value: string): Date {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new Error(`날짜를 해석할 수 없습니다: ${value}`);
    }
    return date;
  }

  @Option({ flags: '-a, --address <address>', description: '특정 입금주소만 되감는다' })
  parseAddress(value: string): string {
    return value;
  }

  @Option({ flags: '-c, --contract <contract>', description: '특정 컨트랙트만 되감는다' })
  parseContract(value: string): string {
    return value;
  }

  @Option({ flags: '-s, --scope <scope>', description: `스코프 (기본 ${ScanScope.DEPOSIT})` })
  parseScope(value: string): ScanScope {
    if (!Object.values(ScanScope).includes(value as ScanScope)) {
      throw new Error(`알 수 없는 스코프: ${value}`);
    }
    return value as ScanScope;
  }
}
