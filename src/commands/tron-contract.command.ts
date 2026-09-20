import { Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';

import { ContractsService } from '../modules/contracts/contracts.service';
import { formatUnits } from '../modules/user-wallets/units';

@Command({
  name: 'tron:contract',
  description: '등록된 자산 목록을 본다. 입금·집금 이력이 FK 로 가리키는 행들이다.',
})
export class TronContractListCommand extends CommandRunner {
  private readonly logger = new Logger(TronContractListCommand.name);

  constructor(private readonly contracts: ContractsService) {
    super();
  }

  async run(): Promise<void> {
    const rows = await this.contracts.findAll();
    if (rows.length === 0) {
      this.logger.log('등록된 자산이 없습니다. `npm run cli -- db:seed` 를 먼저 실행하세요.');
      return;
    }

    const lines = ['symbol     dec  address                             flags        min sweep'];
    for (const row of rows) {
      const flags = [row.isNative ? 'native' : '', row.isActive ? '' : 'inactive']
        .filter(Boolean)
        .join(',');
      lines.push(
        [
          row.symbol.padEnd(10),
          String(row.decimals).padEnd(4),
          (row.address ?? '-').padEnd(35),
          flags.padEnd(12),
          formatUnits(BigInt(row.minSweepAmount), row.decimals),
        ].join(' '),
      );
    }
    lines.push('', '스캔 위치는 자산이 아니라 체인 단위다. tron:info 에서 확인하세요.');

    this.logger.log('\n' + lines.join('\n'));
  }
}

interface ContractAddOptions {
  contract: string;
  minSweep?: string;
}

@Command({
  name: 'tron:contract-add',
  description:
    '컨트랙트를 등록한다. symbol / decimals 는 체인에서 읽는다. 등록하는 순간부터 감시·집금 ' +
    '대상이 되고, 과거 입금은 tron:backfill 로 따로 훑는다. 예) tron:contract-add -c TR7NHq... -m 5000000',
})
export class TronContractAddCommand extends CommandRunner {
  private readonly logger = new Logger(TronContractAddCommand.name);

  constructor(private readonly contracts: ContractsService) {
    super();
  }

  async run(_params: string[], options: ContractAddOptions): Promise<void> {
    const final = await this.contracts.registerFromChain(options.contract, {
      minSweepAmount: options.minSweep,
    });

    this.logger.log(
      `등록 완료: ${final.symbol} (${final.address}) decimals=${final.decimals} ` +
        `minSweep=${final.minSweepAmount}`,
    );
  }

  @Option({ flags: '-c, --contract <address>', description: 'TRC20 컨트랙트 주소', required: true })
  parseContract(value: string): string {
    return value;
  }

  @Option({ flags: '-m, --min-sweep <amount>', description: '자동 집금 최소 금액 (최소 단위)' })
  parseMinSweep(value: string): string {
    if (!/^\d+$/.test(value)) {
      throw new Error('min-sweep 은 최소 단위의 정수여야 합니다. 예) 5000000');
    }
    return value;
  }
}
