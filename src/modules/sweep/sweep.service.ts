import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserWalletsService } from '../user-wallets/user-wallets.service';
import { formatUnits } from '../user-wallets/units';
import { UserWallet } from '../user-wallets/entities/user-wallet.entity';
import { ContractsService } from '../contracts/contracts.service';
import { Contract } from '../contracts/entities/contract.entity';
import { HdWalletService } from '../tron/hd-wallet.service';
import { AccountResources, TronService } from '../tron/tron.service';
import { TransactionStatus, TransactionType } from '../transactions/entities/transaction.entity';
import { TransactionsService } from '../transactions/transactions.service';
import { UserWalletBalance } from '../user-wallets/entities/user-wallet-balance.entity';
import {
  ManualSweepOptions,
  SweepAsset,
  SweepItem,
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
    private readonly contracts: ContractsService,
    private readonly hdWallet: HdWalletService,
    private readonly tron: TronService,
    private readonly config: ConfigService,
  ) {}

  /**
   * 등록된 활성 TRC20 을 전부 훑는다. 대상 지갑은 DB 가 들고 있는 미집금 잔액
   * (deposit_amount - sweep_amount) 으로 고르므로, 후보를 찾는 데 체인 호출이 0 번이다.
   * 체인 조회는 실제로 집금할 지갑에만 나간다.
   */
  async sweepAll(options: SweepOptions = {}): Promise<SweepSummary> {
    const main = this.hdWallet.getMain();
    const dryRun = options.dryRun ?? false;
    const contracts = await this.contracts.findActiveTokens();

    const items: SweepItem[] = [];
    let scanned = 0;

    for (const contract of contracts) {
      const candidates = await this.deposits.findSweepCandidates(
        contract.id,
        contract.minSweepAmount,
      );
      scanned += candidates.length;

      for (const candidate of candidates) {
        items.push(await this.sweepCandidate(candidate, contract, main.address, dryRun));
      }
    }

    return { dryRun, mainAddress: main.address, scanned, items };
  }

  /**
   * 후보는 DB 기준으로 뽑았지만 실제로 옮길 금액은 체인이 정답이다.
   * 둘이 어긋나면 체인을 따르고, 그 사실이 reason 에 남는다.
   */
  private async sweepCandidate(
    candidate: UserWalletBalance,
    contract: Contract,
    mainAddress: string,
    dryRun: boolean,
  ): Promise<SweepItem> {
    const wallet = candidate.userWallet;
    const expected = BigInt(candidate.pendingAmount);
    const balance = await this.tron.getTokenBalance(wallet.address, contract.address!);
    const minToken = BigInt(contract.minSweepAmount);

    if (balance === 0n) {
      this.logger.warn(
        `DB 는 ${expected} 를 기대했지만 체인 잔액이 0 입니다 (${wallet.address} ${contract.symbol}). ` +
          '이미 집금됐는데 기록이 빠졌을 수 있습니다.',
      );
      return {
        ...this.baseItem(wallet.address, contract, 0n),
        status: TransactionStatus.SKIPPED,
        reason: `체인 잔액 없음 (DB 기대치 ${expected})`,
      };
    }

    if (balance < minToken) {
      return {
        ...this.baseItem(wallet.address, contract, balance),
        status: TransactionStatus.SKIPPED,
        reason: `최소 집금액 미만 (min ${minToken})`,
      };
    }

    return this.sweepToken(wallet, mainAddress, balance, contract, dryRun);
  }

  async sweepManual(options: ManualSweepOptions): Promise<SweepSummary> {
    const main = this.hdWallet.getMain();
    const dryRun = options.dryRun ?? false;
    // 아직 등록 안 한 토큰이면 체인에서 메타를 읽어 contract 행을 만들고 이어간다.
    const [target, contract] = await Promise.all([
      this.deposits.findByAddressOrFail(options.address),
      this.contracts.resolveOrRegister(options.contract),
    ]);

    const item = contract.isNative
      ? await this.sweepTrxAll(target, main.address, contract, dryRun)
      : await this.sweepTokenAll(target, main.address, contract, dryRun);

    return { dryRun, mainAddress: main.address, scanned: 1, items: [item] };
  }

  /** 모든 항목이 공유하는 자산·금액 필드. 표시용 값도 여기서 한 번에 채운다. */
  private baseItem(address: string, contract: Contract, amount: bigint): Omit<SweepItem, 'status'> {
    return {
      address,
      asset: contract.isNative ? SweepAsset.TRX : SweepAsset.TOKEN,
      contractId: contract.id,
      contract: contract.address,
      symbol: contract.symbol,
      amount: amount.toString(),
      amountFormatted: formatUnits(amount, contract.decimals),
    };
  }

  private async sweepTokenAll(
    deposit: UserWallet,
    mainAddress: string,
    contract: Contract,
    dryRun: boolean,
  ): Promise<SweepItem> {
    const balance = await this.tron.getTokenBalance(deposit.address, contract.address!);
    if (balance === 0n) {
      return {
        ...this.baseItem(deposit.address, contract, 0n),
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
    contract: Contract,
    dryRun: boolean,
  ): Promise<SweepItem> {
    const strategy = this.config.get<'delegate' | 'transfer'>('tron.feeStrategy')!;
    const item: SweepItem = {
      ...this.baseItem(deposit.address, contract, amount),
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

      item.txid = await this.tron.sendToken(
        wallet.privateKey,
        mainAddress,
        amount,
        contract.address!,
      );
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

    await this.finish(deposit, contract, item);
    return item;
  }

  private async sweepTrxAll(
    deposit: UserWallet,
    mainAddress: string,
    contract: Contract,
    dryRun: boolean,
  ): Promise<SweepItem> {
    const balance = await this.tron.getTrxBalanceStable(deposit.address);
    const sendable = await this.computeSendableTrx(deposit.address, balance);

    if (sendable <= 0n) {
      return {
        ...this.baseItem(deposit.address, contract, balance),
        status: TransactionStatus.SKIPPED,
        reason: '수수료를 빼면 남는 금액이 없음',
      };
    }

    const item: SweepItem = {
      ...this.baseItem(deposit.address, contract, sendable),
      status: TransactionStatus.SUCCESS,
    };

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

    await this.finish(deposit, contract, item);
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

  private async finish(deposit: UserWallet, contract: Contract, item: SweepItem): Promise<void> {
    const main = this.hdWallet.getMain();

    await this.transactions.record({
      userWalletId: deposit.id,
      type: TransactionType.SWEEP,
      status: item.status,
      address: deposit.address,
      contract,
      txid: item.txid ?? null,
      fromAddress: deposit.address,
      toAddress: main.address,
      amount: BigInt(item.amount),
      feeStrategy: item.feeStrategy ?? null,
      feeTxid: item.feeTxid ?? null,
      error: item.error ?? null,
    });

    // 집금 성공분을 누계에 더한다. 이 값이 올라가야 다음 집금 후보에서 빠진다.
    if (item.status === TransactionStatus.SUCCESS) {
      await this.deposits.recordSweep(deposit.id, contract.id, BigInt(item.amount));
    }
  }
}
