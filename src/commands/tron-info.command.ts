import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Command, CommandRunner } from 'nest-commander';

import { ContractsService } from '../modules/contracts/contracts.service';
import { ScanStateService } from '../modules/watcher/scan-state.service';
import { formatUnits } from '../modules/user-wallets/units';
import { HdWalletService } from '../modules/tron/hd-wallet.service';
import { TronService } from '../modules/tron/tron.service';

@Command({
  name: 'tron:info',
  description: '네트워크 연결, 메인지갑 상태, 등록된 자산과 스캔 진행도를 확인한다.',
})
export class TronInfoCommand extends CommandRunner {
  private readonly logger = new Logger(TronInfoCommand.name);

  constructor(
    private readonly tron: TronService,
    private readonly contracts: ContractsService,
    private readonly scanState: ScanStateService,
    private readonly hdWallet: HdWalletService,
    private readonly config: ConfigService,
  ) {
    super();
  }

  async run(): Promise<void> {
    const main = this.hdWallet.getMain();
    const [block, solidified, trx, resources, activated, tokens] = await Promise.all([
      this.tron.getBlockNumber(),
      this.tron.getSolidifiedBlockNumber(),
      this.tron.getTrxBalance(main.address),
      this.tron.getResources(main.address),
      this.tron.isActivated(main.address),
      this.contracts.findTokens(),
    ]);
    const state = await this.scanState.find();

    const lines = [
      `node           : ${this.config.get<string>('tron.fullHost')}`,
      `block          : ${block} (solidified ${solidified})`,
      `scan position  : ${state ? state.lastScannedBlock : '-'}` +
        (state ? `  (남은 블록 ${solidified - state.lastScannedBlock})` : '  (아직 스캔 시작 전)'),
      `fee strategy   : ${this.config.get<string>('tron.feeStrategy')}`,
      '',
      `main address   : ${main.address} (index ${main.index})`,
      `activated      : ${activated}`,
      `TRX            : ${formatUnits(trx, 6)}`,
      `energy         : ${resources.energyAvailable} / ${resources.energyLimit}`,
      `bandwidth      : ${resources.bandwidthAvailable} / ${resources.bandwidthLimit}`,
      '',
      '자산 (메인지갑 잔액 / 최소 집금액)',
    ];

    if (tokens.length === 0) {
      lines.push('  등록된 TRC20 이 없습니다. tron:contract-add 로 등록하세요.');
    }

    const warnings: string[] = [];
    for (const token of tokens) {
      // symbol / decimals 는 DB 가 정답이지만, env 오설정으로 엉뚱한 주소가 등록됐는지는
      // 체인 값과 대조해야 잡힌다. 다르면 경고만 하고 나머지 정보는 그대로 보여준다.
      const [balance, chainMeta] = await Promise.all([
        this.tron.getTokenBalance(main.address, token.address!),
        this.tron.getTokenMeta(token.address!),
      ]);

      lines.push(
        `  ${token.symbol.padEnd(8)} ${token.address} decimals=${token.decimals}` +
          (token.isActive ? '' : ' [inactive]'),
        `    balance ${formatUnits(balance, token.decimals).padEnd(20)}` +
          ` min sweep ${formatUnits(BigInt(token.minSweepAmount), token.decimals)}`,
      );

      if (chainMeta.symbol !== token.symbol || chainMeta.decimals !== token.decimals) {
        warnings.push(
          `[경고] ${token.address} 의 contract 행과 체인 값이 다릅니다: ` +
            `DB ${token.symbol}/${token.decimals} vs 체인 ${chainMeta.symbol}/${chainMeta.decimals}. ` +
            'tron:contract-add 로 다시 등록하세요.',
        );
      }
    }

    if (warnings.length > 0) {
      lines.push('', ...warnings);
    }

    this.logger.log('\n' + lines.join('\n'));
  }
}
