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

/** 블록 로그에서 뽑아낸 TRC20 Transfer 한 건. 주소는 전부 41 prefix 없는 20바이트 소문자 hex */
export interface Trc20Transfer {
  txid: string;
  blockNumber: number;
  blockTimestamp: number;
  logIndex: number;
  contractHex: string;
  fromHex: string;
  toHex: string;
  amount: bigint;
}

/** keccak256("Transfer(address,address,uint256)") */
const TRANSFER_TOPIC = 'ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

/** Base58 주소를 로그와 비교할 수 있는 20바이트 소문자 hex 로 바꾼다 (41 prefix 제거) */
export function toHexAddress(base58: string): string {
  return TronWeb.address.toHex(base58).replace(/^41/, '').toLowerCase();
}

/** 20바이트 hex 주소를 Base58 로 되돌린다 */
export function fromHexAddress(hex: string): string {
  return TronWeb.address.fromHex(`41${hex.replace(/^41/, '')}`);
}

export interface TokenMeta {
  contract: string;
  symbol: string;
  decimals: number;
}

type TokenContract = Awaited<ReturnType<ReturnType<TronWeb['contract']>['at']>>;

interface TransactionInfo {
  id: string;
  blockNumber?: number;
  blockTimeStamp?: number;
  receipt?: { result?: string };
  log?: { address: string; topics?: string[]; data?: string }[];
}

@Injectable()
export class TronService {
  private readonly logger = new Logger(TronService.name);
  private readonly fullHost: string;
  private readonly apiKey: string;
  private readonly feeLimit: number;
  private readonly reader: TronWeb;
  private readonly contracts = new Map<string, TokenContract>();
  private readonly metaCache = new Map<string, TokenMeta>();

  constructor(
    private readonly config: ConfigService,
    private readonly hdWallet: HdWalletService,
  ) {
    this.fullHost = this.config.get<string>('tron.fullHost')!;
    this.apiKey = this.config.get<string>('tron.apiKey')!;
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

  async getTokenMeta(contract: string): Promise<TokenMeta> {
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

  async getTokenBalance(address: string, contract: string): Promise<bigint> {
    const instance = await this.getContract(contract);
    const raw = await instance.balanceOf(address).call();
    return BigInt(raw.toString());
  }

  /** 되돌릴 수 없는(solidified) 최신 블록 번호. 여기까지만 훑으면 reorg 를 다룰 필요가 없다 */
  async getSolidifiedBlockNumber(): Promise<number> {
    const block = await this.solidityPost<{
      block_header?: { raw_data?: { number?: number } };
    }>('walletsolidity/getnowblock', {});
    const number = block.block_header?.raw_data?.number;
    if (typeof number !== 'number') {
      throw new Error('solidified 블록 번호를 읽지 못했습니다.');
    }
    return number;
  }

  /**
   * 블록 하나의 모든 TRC20 Transfer 로그. 지갑 수와 무관하게 블록당 1콜이다.
   *
   * 네이티브 TRX 전송은 로그를 남기지 않아 여기에 잡히지 않는다 — 금액과 상대 주소가
   * 블록 바디에만 있기 때문이다. TRX 는 입금 감시 대상이 아니라 집금 때 실잔액을 직접 읽는다.
   */
  async getBlockTransfers(blockNumber: number): Promise<Trc20Transfer[]> {
    const infos = await this.solidityPost<TransactionInfo[]>(
      'walletsolidity/gettransactioninfobyblocknum',
      { num: blockNumber },
    );

    const transfers: Trc20Transfer[] = [];
    for (const info of infos ?? []) {
      // 되돌려진 트랜잭션의 로그는 반영하면 안 된다.
      if (info.receipt?.result && info.receipt.result !== 'SUCCESS') {
        continue;
      }
      (info.log ?? []).forEach((log, logIndex) => {
        const topics = (log.topics ?? []).map((topic) => topic.toLowerCase());
        // 표준 Transfer 는 from/to 가 indexed 라 토픽이 정확히 3개다.
        if (topics.length !== 3 || topics[0] !== TRANSFER_TOPIC) {
          return;
        }
        transfers.push({
          txid: info.id,
          blockNumber: info.blockNumber ?? blockNumber,
          blockTimestamp: info.blockTimeStamp ?? 0,
          logIndex,
          contractHex: log.address.replace(/^41/, '').toLowerCase(),
          fromHex: topics[1].slice(-40),
          toHex: topics[2].slice(-40),
          amount: BigInt(`0x${(log.data || '0').slice(0, 64) || '0'}`),
        });
      });
    }
    return transfers;
  }

  private async solidityPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const base = this.fullHost.replace(/\/$/, '');
    const res = await fetch(`${base}/${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(this.apiKey ? { 'TRON-PRO-API-KEY': this.apiKey } : {}),
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`${path} 실패 (${res.status}): ${await res.text()}`);
    }
    return (await res.json()) as T;
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
    contract: string,
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
