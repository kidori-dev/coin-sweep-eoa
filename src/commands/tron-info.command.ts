import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Command, CommandRunner } from 'nest-commander';

import { formatUnits } from '../modules/user-wallets/units';
import { HdWalletService } from '../modules/tron/hd-wallet.service';
import { TronService } from '../modules/tron/tron.service';

@Command({
  name: 'tron:info',
  description: '네트워크 연결과 메인지갑 상태를 확인한다.',
})
export class TronInfoCommand extends CommandRunner {
  private readonly logger = new Logger(TronInfoCommand.name);

  constructor(
    private readonly tron: TronService,
    private readonly hdWallet: HdWalletService,
    private readonly config: ConfigService,
  ) {
    super();
  }

  async run(): Promise<void> {
    const main = this.hdWallet.getMain();
    const [block, trx, token, meta, resources, activated] = await Promise.all([
      this.tron.getBlockNumber(),
      this.tron.getTrxBalance(main.address),
      this.tron.getTokenBalance(main.address),
      this.tron.getTokenMeta(),
      this.tron.getResources(main.address),
      this.tron.isActivated(main.address),
    ]);

    const lines = [
      `node           : ${this.config.get<string>('tron.fullHost')}`,
      `block          : ${block}`,
      `token          : ${meta.symbol} (${meta.contract}) decimals=${meta.decimals}`,
      `fee strategy   : ${this.config.get<string>('tron.feeStrategy')}`,
      '',
      `main address   : ${main.address} (index ${main.index})`,
      `activated      : ${activated}`,
      `TRX            : ${formatUnits(trx, 6)}`,
      `${meta.symbol.padEnd(15)}: ${formatUnits(token, meta.decimals)}`,
      `energy         : ${resources.energyAvailable} / ${resources.energyLimit}`,
      `bandwidth      : ${resources.bandwidthAvailable} / ${resources.bandwidthLimit}`,
    ];

    this.logger.log('\n' + lines.join('\n'));
  }
}
