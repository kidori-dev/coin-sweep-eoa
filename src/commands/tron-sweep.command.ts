import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Command, CommandRunner, Option } from 'nest-commander';

import { NATIVE_TRX, SweepService, SweepSummary } from '../modules/sweep/sweep.service';
import { HdWalletService } from '../modules/tron/hd-wallet.service';
import { TronService } from '../modules/tron/tron.service';

function render(summary: SweepSummary): string {
  const lines = [
    `dry-run    : ${summary.dryRun}`,
    `main wallet: ${summary.mainAddress}`,
    `contract   : ${summary.contract}`,
    `scanned    : ${summary.scanned}`,
  ];

  if (summary.items.length === 0) {
    lines.push('집금 대상 없음');
  }
  for (const item of summary.items) {
    lines.push(
      `[${item.status}] ${item.address} ${item.amountFormatted ?? item.amount} ${item.symbol ?? item.asset}` +
        (item.txid ? ` tx=${item.txid}` : '') +
        (item.feeTxid ? ` fee(${item.feeStrategy})=${item.feeTxid}` : '') +
        (item.reason ? ` (${item.reason})` : '') +
        (item.error ? ` error=${item.error}` : ''),
    );
  }
  return '\n' + lines.join('\n');
}

interface SweepCommandOptions {
  dryRun?: boolean;
}

@Command({
  name: 'tron:sweep',
  description:
    '최소 집금액 이상인 모든 유저 지갑의 USDT 를 집금한다. --dry-run 으로 먼저 확인하세요.',
})
export class TronSweepCommand extends CommandRunner {
  private readonly logger = new Logger(TronSweepCommand.name);

  constructor(private readonly sweep: SweepService) {
    super();
  }

  async run(_params: string[], options: SweepCommandOptions): Promise<void> {
    const summary = await this.sweep.sweepAll({ dryRun: options.dryRun ?? false });
    this.logger.log(render(summary));
  }

  @Option({ flags: '-d, --dry-run', description: '전송 없이 집금 대상만 계산' })
  parseDryRun(): boolean {
    return true;
  }
}

interface ManualSweepCommandOptions {
  contract: string;
  address: string;
  dryRun?: boolean;
}

@Command({
  name: 'tron:sweep-manual',
  description:
    '컨트랙트 주소와 지갑 주소를 지정해 해당 자산 잔액 전부를 집금한다(최소금액 무시). ' +
    '예) tron:sweep-manual -c TR7NHq... -a TGvDe..., TRX 는 -c TRX',
})
export class TronManualSweepCommand extends CommandRunner {
  private readonly logger = new Logger(TronManualSweepCommand.name);

  constructor(private readonly sweep: SweepService) {
    super();
  }

  async run(_params: string[], options: ManualSweepCommandOptions): Promise<void> {
    const summary = await this.sweep.sweepManual({
      contract: options.contract,
      address: options.address,
      dryRun: options.dryRun ?? false,
    });
    this.logger.log(render(summary));
  }

  @Option({
    flags: '-c, --contract <contract>',
    description: `TRC20 컨트랙트 주소, 또는 네이티브 TRX 는 "${NATIVE_TRX}"`,
    required: true,
  })
  parseContract(value: string): string {
    return value;
  }

  @Option({ flags: '-a, --address <address>', description: '대상 유저 지갑 주소', required: true })
  parseAddress(value: string): string {
    return value;
  }

  @Option({ flags: '-d, --dry-run', description: '전송 없이 집금 대상만 계산' })
  parseDryRun(): boolean {
    return true;
  }
}

interface StakeOptions {
  amount: number;
}

@Command({
  name: 'tron:stake',
  description:
    'delegate 전략용으로 메인지갑 TRX 를 스테이킹해 energy 를 확보한다. 예) tron:stake -a 200',
})
export class TronStakeCommand extends CommandRunner {
  private readonly logger = new Logger(TronStakeCommand.name);

  constructor(
    private readonly tron: TronService,
    private readonly hdWallet: HdWalletService,
    private readonly config: ConfigService,
  ) {
    super();
  }

  async run(_params: string[], options: StakeOptions): Promise<void> {
    const main = this.hdWallet.getMain();
    const amountSun = Math.floor(options.amount * 1_000_000);

    this.logger.log(`freezeBalanceV2 ENERGY ${options.amount} TRX from ${main.address}`);
    const txid = await this.tron.freezeForEnergy(main.privateKey, amountSun);
    const ok = await this.tron.waitForSuccess(txid);

    const resources = await this.tron.getResources(main.address);
    this.logger.log(
      `tx=${txid} success=${ok} | energy ${resources.energyAvailable}/${resources.energyLimit} ` +
        `| 집금 1건당 필요 energy ${this.config.get<number>('tron.delegateEnergy')}`,
    );
  }

  @Option({ flags: '-a, --amount <trx>', description: '스테이킹할 TRX 양', required: true })
  parseAmount(value: string): number {
    const amount = Number(value);
    if (Number.isNaN(amount) || amount <= 0) {
      throw new Error('amount 는 0보다 큰 숫자여야 합니다.');
    }
    return amount;
  }
}
