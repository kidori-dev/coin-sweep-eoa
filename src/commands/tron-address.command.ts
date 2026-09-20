import { Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';

import { ContractsService } from '../modules/contracts/contracts.service';
import { TronService } from '../modules/tron/tron.service';
import { UserWalletsService } from '../modules/user-wallets/user-wallets.service';
import { formatUnits } from '../modules/user-wallets/units';

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
  description:
    '입금주소가 들고 있는 자산을 전부 보여준다 (체인 실잔액 + DB 미집금). ' +
    '지갑마다 체인을 조회하므로 지갑이 많으면 느리다.',
})
export class TronBalanceCommand extends CommandRunner {
  private readonly logger = new Logger(TronBalanceCommand.name);

  constructor(
    private readonly deposits: UserWalletsService,
    private readonly contracts: ContractsService,
    private readonly tron: TronService,
  ) {
    super();
  }

  async run(): Promise<void> {
    const [rows, tokens] = await Promise.all([
      this.deposits.findAll(),
      this.contracts.findTokens(),
    ]);

    if (rows.length === 0) {
      this.logger.log('발급된 입금주소가 없습니다. tron:issue 로 먼저 발급하세요.');
      return;
    }

    const balances = await this.deposits.findBalanceMap(rows.map((row) => row.id));
    const lines: string[] = [];

    for (const row of rows) {
      const trxSun = await this.tron.getTrxBalance(row.address);
      lines.push(
        `[${String(row.derivationIndex).padStart(3)}] ${row.address}  TRX ${formatUnits(trxSun, 6)}`,
      );

      const owned = balances.get(row.id) ?? [];
      for (const token of tokens) {
        const chain = await this.tron.getTokenBalance(row.address, token.address!);
        const db = owned.find((item) => item.contractId === token.id);
        const pending = BigInt(db?.pendingAmount ?? '0');
        // 체인에도 DB 에도 없는 자산은 줄만 늘리므로 접는다.
        if (chain === 0n && pending === 0n) {
          continue;
        }
        lines.push(
          `        ${token.symbol.padEnd(8)} chain ${formatUnits(chain, token.decimals).padEnd(20)}` +
            ` DB미집금 ${formatUnits(pending, token.decimals)}` +
            (token.isActive ? '' : '  [inactive]'),
        );
      }
    }

    this.logger.log('\n' + lines.join('\n'));
  }
}
