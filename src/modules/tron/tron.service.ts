import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TronWeb } from 'tronweb';

import { HdWalletService } from './hd-wallet.service';

export interface AccountResources {
  energyLimit: number;
  energyUsed: number;
  energyAvailable: number;
  bandwidthLimit: number;
  bandwidthUsed: number;
  bandwidthAvailable: number;
}

export interface Trc20Transfer {
  txid: string;
  from: string;
  to: string;
  amount: bigint;
  blockTimestamp: number;
}

export interface TokenMeta {
  contract: string;
  symbol: string;
  decimals: number;
}

type TokenContract = Awaited<ReturnType<ReturnType<TronWeb['contract']>['at']>>;

@Injectable()
export class TronService {
  private readonly logger = new Logger(TronService.name);
  private readonly fullHost: string;
  private readonly apiKey: string;
  private readonly feeLimit: number;
  private readonly reader: TronWeb;
  private readonly contracts = new Map<string, TokenContract>();
  private readonly metaCache = new Map<string, TokenMeta>();

  readonly defaultToken: string;

  constructor(
    private readonly config: ConfigService,
    private readonly hdWallet: HdWalletService,
  ) {
    this.fullHost = this.config.get<string>('tron.fullHost')!;
    this.apiKey = this.config.get<string>('tron.apiKey')!;
    this.defaultToken = this.config.get<string>('tron.tokenContract')!;
    this.feeLimit = this.config.get<number>('tron.feeLimitSun')!;
    this.reader = this.createClient();
    this.reader.setAddress(this.hdWallet.getMain().address);
  }

  private createClient(privateKey?: string): TronWeb {
    return new TronWeb({
      fullHost: this.fullHost,
      headers: this.apiKey ? { 'TRON-PRO-API-KEY': this.apiKey } : undefined,
      privateKey,
    });
  }

  async getBlockNumber(): Promise<number> {
    const block = await this.reader.trx.getCurrentBlock();
    return block.block_header.raw_data.number;
  }

  async getTrxBalance(address: string): Promise<bigint> {
    return BigInt(await this.reader.trx.getBalance(address));
  }

  async getTrxBalanceStable(address: string, retries = 2): Promise<bigint> {
    let balance = await this.getTrxBalance(address);
    for (let i = 0; i < retries && balance === 0n; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      balance = await this.getTrxBalance(address);
    }
    return balance;
  }

  private async getContract(contract: string): Promise<TokenContract> {
    const cached = this.contracts.get(contract);
    if (cached) {
      return cached;
    }
    const instance = await this.reader.contract().at(contract);
    this.contracts.set(contract, instance);
    return instance;
  }

  async getTokenMeta(contract = this.defaultToken): Promise<TokenMeta> {
    const cached = this.metaCache.get(contract);
    if (cached) {
      return cached;
    }
    const instance = await this.getContract(contract);
    const [symbol, decimals] = await Promise.all([
      instance.symbol().call(),
      instance.decimals().call(),
    ]);
    const meta: TokenMeta = {
      contract,
      symbol: String(symbol),
      decimals: Number(decimals),
    };
    this.metaCache.set(contract, meta);
    return meta;
  }

  async getTokenBalance(address: string, contract = this.defaultToken): Promise<bigint> {
    const instance = await this.getContract(contract);
    const raw = await instance.balanceOf(address).call();
    return BigInt(raw.toString());
  }

  async getIncomingTrc20(
    address: string,
    contract: string,
    sinceMs: number,
    limit = 200,
  ): Promise<Trc20Transfer[]> {
    const base = this.fullHost.replace(/\/$/, '');
    const params = new URLSearchParams({
      contract_address: contract,
      only_to: 'true',
      order_by: 'block_timestamp,asc',
      min_timestamp: String(sinceMs),
      limit: String(limit),
    });

    const res = await fetch(`${base}/v1/accounts/${address}/transactions/trc20?${params}`, {
      headers: this.apiKey ? { 'TRON-PRO-API-KEY': this.apiKey } : undefined,
    });
    if (!res.ok) {
      throw new Error(`TronGrid 조회 실패 (${res.status}): ${await res.text()}`);
    }

    const body = (await res.json()) as {
      success?: boolean;
      error?: string;
      data?: {
        transaction_id: string;
        from: string;
        to: string;
        value: string;
        type: string;
        block_timestamp: number;
        token_info?: { address?: string };
      }[];
    };
    if (body.success === false) {
      throw new Error(`TronGrid 조회 실패: ${body.error ?? 'unknown'}`);
    }

    return (body.data ?? [])
      .filter((row) => row.type === 'Transfer' && row.to === address)
      .map((row) => ({
        txid: row.transaction_id,
        from: row.from,
        to: row.to,
        amount: BigInt(row.value),
        blockTimestamp: row.block_timestamp,
      }));
  }

  async isActivated(address: string): Promise<boolean> {
    const account = await this.reader.trx.getAccount(address);
    return Boolean(account && Object.keys(account).length > 0);
  }

  async getResources(address: string): Promise<AccountResources> {
    const res = (await this.reader.trx.getAccountResources(address)) as unknown as Record<
      string,
      number
    >;
    const energyLimit = res.EnergyLimit ?? 0;
    const energyUsed = res.EnergyUsed ?? 0;
    const bandwidthLimit = (res.freeNetLimit ?? 0) + (res.NetLimit ?? 0);
    const bandwidthUsed = (res.freeNetUsed ?? 0) + (res.NetUsed ?? 0);
    return {
      energyLimit,
      energyUsed,
      energyAvailable: energyLimit - energyUsed,
      bandwidthLimit,
      bandwidthUsed,
      bandwidthAvailable: bandwidthLimit - bandwidthUsed,
    };
  }

  async sendTrx(privateKey: string, to: string, amountSun: bigint): Promise<string> {
    const client = this.createClient(privateKey);
    const from = TronWeb.address.fromPrivateKey(privateKey) as string;
    const tx = await client.transactionBuilder.sendTrx(to, Number(amountSun), from);
    return this.signAndSend(client, tx, privateKey, 'sendTrx');
  }

  async sendToken(
    privateKey: string,
    to: string,
    amount: bigint,
    contract = this.defaultToken,
  ): Promise<string> {
    const client = this.createClient(privateKey);
    const instance = await client.contract().at(contract);
    const txid = await instance.transfer(to, amount.toString()).send({ feeLimit: this.feeLimit });
    return txid as string;
  }

  async delegateEnergy(privateKey: string, to: string, balanceSun: number): Promise<string> {
    const client = this.createClient(privateKey);
    const from = TronWeb.address.fromPrivateKey(privateKey) as string;
    const tx = await client.transactionBuilder.delegateResource(
      balanceSun,
      to,
      'ENERGY',
      from,
      false,
    );
    return this.signAndSend(client, tx, privateKey, 'delegateResource');
  }

  async undelegateEnergy(privateKey: string, to: string, balanceSun: number): Promise<string> {
    const client = this.createClient(privateKey);
    const from = TronWeb.address.fromPrivateKey(privateKey) as string;
    const tx = await client.transactionBuilder.undelegateResource(balanceSun, to, 'ENERGY', from);
    return this.signAndSend(client, tx, privateKey, 'undelegateResource');
  }

  async freezeForEnergy(privateKey: string, amountSun: number): Promise<string> {
    const client = this.createClient(privateKey);
    const from = TronWeb.address.fromPrivateKey(privateKey) as string;
    const tx = await client.transactionBuilder.freezeBalanceV2(amountSun, 'ENERGY', from);
    return this.signAndSend(client, tx, privateKey, 'freezeBalanceV2');
  }

  async waitForSuccess(txid: string, timeoutMs = 45000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      try {
        const tx = (await this.reader.trx.getTransaction(txid)) as {
          ret?: { contractRet?: string }[];
        };
        const ret = tx.ret?.[0]?.contractRet;
        if (!ret) {
          continue;
        }
        if (ret !== 'SUCCESS') {
          this.logger.warn(`tx ${txid} 실패: ${ret}`);
          return false;
        }
        return true;
      } catch {
        continue;
      }
    }
    this.logger.warn(`confirmation timeout: ${txid}`);
    return false;
  }

  async estimateSunForEnergy(energy: number): Promise<number> {
    const res = (await this.reader.trx.getAccountResources(
      this.hdWallet.getMain().address,
    )) as unknown as Record<string, number>;
    const totalLimit = res.TotalEnergyLimit ?? 0;
    const totalWeight = res.TotalEnergyWeight ?? 0;
    if (!totalLimit || !totalWeight) {
      throw new Error('네트워크 energy 비율을 읽지 못했습니다.');
    }
    const energyPerTrx = totalLimit / totalWeight;
    return Math.ceil((energy / energyPerTrx) * 1_000_000);
  }

  private async signAndSend(
    client: TronWeb,
    tx: unknown,
    privateKey: string,
    label: string,
  ): Promise<string> {
    const signed = await client.trx.sign(tx as never, privateKey);
    const result = (await client.trx.sendRawTransaction(signed)) as {
      result?: boolean;
      txid?: string;
      code?: string;
      message?: string;
    };
    if (result.code || result.result === false || !result.txid) {
      const reason = result.message
        ? Buffer.from(result.message, 'hex').toString('utf8')
        : result.code;
      throw new Error(`${label} 실패: ${reason ?? JSON.stringify(result)}`);
    }
    return result.txid;
  }
}
