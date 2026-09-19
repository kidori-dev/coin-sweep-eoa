import { Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';

import { UserWalletsService } from '../modules/user-wallets/user-wallets.service';
import { formatUnits } from '../modules/user-wallets/units';
import { TronService } from '../modules/tron/tron.service';

interface IssueOptions {
  userRef?: string;
  count: number;
}

@Command({
  name: 'tron:issue',
  description: '입금주소를 발급한다. 예) npm run cli -- tron:issue -c 3 -u user-1024',
})
export class TronIssueCommand extends CommandRunner {
  private readonly logger = new Logger(TronIssueCommand.name);

  constructor(private readonly deposits: UserWalletsService) {
    super();
  }

  async run(_params: string[], options: IssueOptions): Promise<void> {
    const count = options.count ?? 1;
    for (let i = 0; i < count; i += 1) {
      const issued = await this.deposits.issue(options.userRef ?? null);
      this.logger.log(`index ${issued.derivationIndex} -> ${issued.address}`);
    }
  }

  @Option({ flags: '-c, --count <count>', description: '발급 개수 (기본 1)' })
  parseCount(value: string): number {
    const count = parseInt(value, 10);
    if (Number.isNaN(count) || count < 1) {
      throw new Error('count 는 1 이상의 정수여야 합니다.');
    }
    return count;
  }

  @Option({ flags: '-u, --user-ref <userRef>', description: '사용자 식별자' })
  parseUserRef(value: string): string {
    return value;
  }
}

@Command({
  name: 'tron:balance',
  description: '입금주소들의 TRX / 토큰 잔액을 조회한다.',
})
export class TronBalanceCommand extends CommandRunner {
  private readonly logger = new Logger(TronBalanceCommand.name);

  constructor(
    private readonly deposits: UserWalletsService,
    private readonly tron: TronService,
  ) {
    super();
  }

  async run(): Promise<void> {
    const [rows, meta] = await Promise.all([this.deposits.findAll(), this.tron.getTokenMeta()]);

    if (rows.length === 0) {
      this.logger.log('발급된 입금주소가 없습니다. tron:issue 로 먼저 발급하세요.');
      return;
    }

    const lines = [
      `idx  address                             TRX            ${meta.symbol}`.padEnd(70) +
        'DB잔고',
    ];
    for (const row of rows) {
      const balance = await this.deposits.getBalance(row.address);
      lines.push(
        [
          String(row.derivationIndex).padEnd(4),
          row.address.padEnd(35),
          formatUnits(balance.trxSun, 6).padEnd(14),
          formatUnits(balance.token, meta.decimals).padEnd(15),
          formatUnits(BigInt(row.usdtAmount), meta.decimals),
        ].join(' '),
      );
    }

    this.logger.log('\n' + lines.join('\n'));
  }
}
