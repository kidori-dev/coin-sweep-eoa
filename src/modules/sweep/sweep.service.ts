import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserWalletsService } from '../user-wallets/user-wallets.service';
import { formatUnits } from '../user-wallets/units';
import { UserWallet } from '../user-wallets/entities/user-wallet.entity';
import { ScanScope } from '../scan/entities/scan-cursor.entity';
import { ScanTrigger } from '../scan/entities/scan-run.entity';
import { ScanRunService } from '../scan/scan-run.service';
import { HdWalletService } from '../tron/hd-wallet.service';
import { AccountResources, TronService } from '../tron/tron.service';
import { TransactionStatus, TransactionType } from '../transactions/entities/transaction.entity';
import { TransactionsService } from '../transactions/transactions.service';
import {
  ManualSweepOptions,
  NATIVE_TRX,
  SweepAsset,
  SweepItem,
  SweepItemView,
  SweepOptions,
  SweepSummary,
} from './sweep.types';

const TRX_TRANSFER_BANDWIDTH = 300;
const TOKEN_TRANSFER_BANDWIDTH = 350;
const BANDWIDTH_FEE_SUN = 300_000n;

@Injectable()
export class SweepService {
  private readonly logger = new Logger(SweepService.name);

  constructor(
    private readonly transactions: TransactionsService,
    private readonly deposits: UserWalletsService,
    private readonly hdWallet: HdWalletService,
    private readonly tron: TronService,
    private readonly runs: ScanRunService,
    private readonly config: ConfigService,
  ) {}

  async sweepAll(options: SweepOptions = {}): Promise<SweepSummary> {
    const main = this.hdWallet.getMain();
    const contract = this.tron.defaultToken;
    const minToken = BigInt(this.config.get<number>('tron.minSweepToken')!);
    const dryRun = options.dryRun ?? false;

    const targets = await this.deposits.findActive();
    // 집금은 체인 잔액을 직접 읽으므로 커서가 없다. 실행 이력만 남겨서
    // 배치가 중간에 죽었는지(running 으로 남는다), 몇 건이 실패했는지를 볼 수 있게 한다.
    const run = await this.runs.start({
      scope: ScanScope.SWEEP,
      trigger: options.trigger ?? ScanTrigger.API,
      dryRun,
      contract,
    });

    const items: SweepItem[] = [];
    try {
      for (const target of targets) {
        const balance = await this.tron.getTokenBalance(target.address, contract);
        if (balance >= minToken) {
          items.push(await this.sweepToken(target, main.address, balance, contract, dryRun));
        } else if (balance > 0n) {
          items.push({
            address: target.address,
            asset: SweepAsset.TOKEN,
            contract,
            amount: balance.toString(),
            status: TransactionStatus.SKIPPED,
            reason: `최소 집금액 미만 (min ${minToken})`,
          });
        }
      }
    } catch (err) {
      await this.runs.fail(run.id, (err as Error).message, this.countRun(targets.length, items));
      throw err;
    }

    await this.finishRun(run.id, targets.length, items);

    return {
      dryRun,
      mainAddress: main.address,
      contract,
      scanned: targets.length,
      runId: run.id,
      items: await this.decorate(items),
    };
  }

  async sweepManual(options: ManualSweepOptions): Promise<SweepSummary> {
    const main = this.hdWallet.getMain();
    const dryRun = options.dryRun ?? false;
    const target = await this.deposits.findByAddressOrFail(options.address);

    const run = await this.runs.start({
      scope: ScanScope.SWEEP,
      trigger: options.trigger ?? ScanTrigger.API,
      dryRun,
      contract: options.contract === NATIVE_TRX ? null : options.contract,
    });

    let item: SweepItem;
    try {
      item =
        options.contract === NATIVE_TRX
          ? await this.sweepTrxAll(target, main.address, dryRun)
          : await this.sweepTokenAll(target, main.address, options.contract, dryRun);
    } catch (err) {
      await this.runs.fail(run.id, (err as Error).message, this.countRun(1, []));
      throw err;
    }

    await this.finishRun(run.id, 1, [item]);

    return {
      dryRun,
      mainAddress: main.address,
      contract: options.contract,
      scanned: 1,
      runId: run.id,
      items: await this.decorate([item]),
    };
  }

  private countRun(walletsScanned: number, items: SweepItem[]) {
    return {
      walletsScanned,
      found: items.length,
      applied: items.filter((item) => item.status === TransactionStatus.SUCCESS).length,
      failed: items.filter((item) => item.status === TransactionStatus.FAILED).length,
    };
  }

  private async finishRun(runId: string, walletsScanned: number, items: SweepItem[]) {
    const counts = this.countRun(walletsScanned, items);
    if (counts.failed > 0) {
      const reasons = items
        .filter((item) => item.status === TransactionStatus.FAILED)
        .map((item) => `${item.address}: ${item.error ?? '알 수 없음'}`)
        .join('\n');
      await this.runs.fail(runId, `${counts.failed}건 집금 실패\n${reasons}`, counts);
      return;
    }
    await this.runs.finish(runId, counts);
  }

  private async describeAsset(
    asset: SweepAsset,
    contract: string | null,
  ): Promise<{ decimals: number; symbol: string }> {
    if (asset === SweepAsset.TRX || !contract) {
      return { decimals: 6, symbol: NATIVE_TRX };
    }
    const meta = await this.tron.getTokenMeta(contract);
    return { decimals: meta.decimals, symbol: meta.symbol };
  }

  private async decorate(items: SweepItem[]): Promise<SweepItemView[]> {
    const views: SweepItemView[] = [];
    for (const item of items) {
      const { decimals, symbol } = await this.describeAsset(item.asset, item.contract);
      views.push({
        ...item,
        amountFormatted: formatUnits(BigInt(item.amount), decimals),
        symbol,
      });
    }
    return views;
  }

  private async sweepTokenAll(
    deposit: UserWallet,
    mainAddress: string,
    contract: string,
    dryRun: boolean,
  ): Promise<SweepItem> {
    const balance = await this.tron.getTokenBalance(deposit.address, contract);
    if (balance === 0n) {
      return {
        address: deposit.address,
        asset: SweepAsset.TOKEN,
        contract,
        amount: '0',
        status: TransactionStatus.SKIPPED,
        reason: '잔액 없음',
      };
    }
    return this.sweepToken(deposit, mainAddress, balance, contract, dryRun);
  }

  private async sweepToken(
    deposit: UserWallet,
    mainAddress: string,
    amount: bigint,
    contract: string,
    dryRun: boolean,
  ): Promise<SweepItem> {
    const strategy = this.config.get<'delegate' | 'transfer'>('tron.feeStrategy')!;
    const item: SweepItem = {
      address: deposit.address,
      asset: SweepAsset.TOKEN,
      contract,
      amount: amount.toString(),
      status: TransactionStatus.SUCCESS,
      feeStrategy: strategy,
    };

    if (dryRun) {
      item.reason = `${strategy} 전략으로 집금 예정`;
      return item;
    }

    const main = this.hdWallet.getMain();
    const wallet = this.hdWallet.derive(deposit.derivationIndex);
    let undelegateSun = 0;

    try {
      const activated = await this.isActivated(deposit.address);
      const resources = activated ? await this.tron.getResources(deposit.address) : null;

      const funding = await this.fundAddress(
        deposit.address,
        main.privateKey,
        strategy,
        activated,
        resources,
      );

      const resolved = await this.provideFee(
        strategy,
        main.privateKey,
        deposit.address,
        funding.gasFunded,
      );
      item.feeStrategy = resolved.strategy;
      item.feeTxid = resolved.txid ?? funding.txid;
      undelegateSun = resolved.undelegateSun;

      item.txid = await this.tron.sendToken(wallet.privateKey, mainAddress, amount, contract);
      if (!(await this.tron.waitForSuccess(item.txid))) {
        item.status = TransactionStatus.FAILED;
        item.error = '토큰 전송이 체인에서 실패했습니다 (energy 부족 등)';
      }
    } catch (err) {
      item.status = TransactionStatus.FAILED;
      item.error = (err as Error).message;
      this.logger.error(`token sweep 실패 ${deposit.address}: ${item.error}`);
    } finally {
      if (undelegateSun > 0) {
        try {
          await this.tron.undelegateEnergy(main.privateKey, deposit.address, undelegateSun);
        } catch (err) {
          this.logger.warn(`위임 회수 실패 ${deposit.address}: ${(err as Error).message}`);
        }
      }
    }

    await this.finish(deposit, item);
    return item;
  }

  private async sweepTrxAll(
    deposit: UserWallet,
    mainAddress: string,
    dryRun: boolean,
  ): Promise<SweepItem> {
    const balance = await this.tron.getTrxBalanceStable(deposit.address);
    const sendable = await this.computeSendableTrx(deposit.address, balance);

    const item: SweepItem = {
      address: deposit.address,
      asset: SweepAsset.TRX,
      contract: null,
      amount: sendable.toString(),
      status: TransactionStatus.SUCCESS,
    };

    if (sendable <= 0n) {
      item.status = TransactionStatus.SKIPPED;
      item.amount = balance.toString();
      item.reason = '수수료를 빼면 남는 금액이 없음';
      return item;
    }

    if (dryRun) {
      item.reason = '집금 예정';
      return item;
    }

    try {
      const wallet = this.hdWallet.derive(deposit.derivationIndex);
      item.txid = await this.tron.sendTrx(wallet.privateKey, mainAddress, sendable);
      if (!(await this.tron.waitForSuccess(item.txid))) {
        item.status = TransactionStatus.FAILED;
        item.error = 'TRX 전송이 체인에서 실패했습니다';
      }
    } catch (err) {
      item.status = TransactionStatus.FAILED;
      item.error = (err as Error).message;
      this.logger.error(`trx sweep 실패 ${deposit.address}: ${item.error}`);
    }

    await this.finish(deposit, item);
    return item;
  }

  private async computeSendableTrx(address: string, balance: bigint): Promise<bigint> {
    let available = balance;
    if (available <= 0n) {
      return 0n;
    }

    const resources = await this.tron.getResources(address);
    if (resources.bandwidthAvailable >= TRX_TRANSFER_BANDWIDTH) {
      return available;
    }

    available -= BANDWIDTH_FEE_SUN;
    return available > BANDWIDTH_FEE_SUN ? available : 0n;
  }

  private async fundAddress(
    address: string,
    mainPrivateKey: string,
    strategy: 'delegate' | 'transfer',
    activated: boolean,
    resources: AccountResources | null,
  ): Promise<{ txid?: string; gasFunded: boolean }> {
    const activationSun = BigInt(this.config.get<number>('tron.activationSun')!);
    const bandwidthTopupSun = BigInt(this.config.get<number>('tron.bandwidthTopupSun')!);
    const gasTopupSun = BigInt(this.config.get<number>('tron.gasTopupSun')!);

    let need = 0n;

    if (!activated) {
      need = activationSun;
    } else if ((resources?.bandwidthAvailable ?? 0) < TOKEN_TRANSFER_BANDWIDTH) {
      const balance = await this.tron.getTrxBalance(address);
      if (balance < bandwidthTopupSun) {
        need = bandwidthTopupSun - balance;
      }
    }

    const gasFunded = strategy === 'transfer';
    if (gasFunded && need < gasTopupSun) {
      need = gasTopupSun;
    }

    if (need === 0n) {
      return { gasFunded };
    }

    const purpose = activated ? '수수료' : '계정 활성화';
    this.logger.log(`${purpose}용 TRX 전송 ${address} ${need} SUN (전략=${strategy})`);
    const txid = await this.tron.sendTrx(mainPrivateKey, address, need);
    if (!(await this.tron.waitForSuccess(txid))) {
      throw new Error(`수수료 TRX 전송 실패: ${address}`);
    }
    return { txid, gasFunded };
  }

  private async isActivated(address: string): Promise<boolean> {
    if (await this.tron.isActivated(address)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
    return this.tron.isActivated(address);
  }

  private async provideFee(
    strategy: 'delegate' | 'transfer',
    mainPrivateKey: string,
    address: string,
    gasFunded: boolean,
  ): Promise<{ strategy: string; txid?: string; undelegateSun: number }> {
    if (strategy === 'delegate') {
      const energyNeed = this.config.get<number>('tron.delegateEnergy')!;
      const neededSun = await this.tron.estimateSunForEnergy(energyNeed);
      try {
        const txid = await this.tron.delegateEnergy(mainPrivateKey, address, neededSun);
        if (!(await this.tron.waitForSuccess(txid))) {
          throw new Error('위임 트랜잭션이 체인에서 실패했습니다');
        }
        return { strategy: 'delegate', txid, undelegateSun: neededSun };
      } catch (err) {
        const reason = `위임 실패 (${energyNeed} energy / ${neededSun} SUN): ${(err as Error).message}`;
        if (!this.config.get<boolean>('tron.feeFallback')) {
          throw new Error(reason);
        }
        this.logger.warn(`${reason} → transfer 전략으로 대체`);
      }
    }

    if (gasFunded) {
      return { strategy: 'transfer', undelegateSun: 0 };
    }

    const gasTopupSun = BigInt(this.config.get<number>('tron.gasTopupSun')!);
    const txid = await this.tron.sendTrx(mainPrivateKey, address, gasTopupSun);
    if (!(await this.tron.waitForSuccess(txid))) {
      throw new Error(`수수료 TRX 전송 실패: ${address}`);
    }
    return { strategy: 'transfer', txid, undelegateSun: 0 };
  }
  private async finish(deposit: UserWallet, item: SweepItem): Promise<void> {
    const main = this.hdWallet.getMain();
    const { symbol, decimals } = await this.describeAsset(item.asset, item.contract);

    await this.transactions.record({
      userWalletId: deposit.id,
      type: TransactionType.SWEEP,
      status: item.status,
      address: deposit.address,
      contract: item.contract,
      tokenSymbol: symbol,
      tokenDecimals: decimals,
      txid: item.txid ?? null,
      fromAddress: deposit.address,
      toAddress: main.address,
      amount: BigInt(item.amount),
      feeStrategy: item.feeStrategy ?? null,
      feeTxid: item.feeTxid ?? null,
      error: item.error ?? null,
    });

    if (item.status === TransactionStatus.SUCCESS) {
      await this.deposits.markSwept(deposit.id);
    }
  }
}
