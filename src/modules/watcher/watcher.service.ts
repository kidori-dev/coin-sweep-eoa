import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { TransactionStatus, TransactionType } from '../transactions/entities/transaction.entity';
import { TransactionsService } from '../transactions/transactions.service';
import { TronService, Trc20Transfer } from '../tron/tron.service';
import { UserWallet } from '../user-wallets/entities/user-wallet.entity';
import { formatUnits } from '../user-wallets/units';
import { UserWalletsService } from '../user-wallets/user-wallets.service';

export interface WatchOptions {
  dryRun?: boolean;
}

export interface WatchedDeposit {
  address: string;
  txid: string;
  contract: string;
  from: string;
  to: string;
  amount: string;
  amountFormatted: string;
  blockTimestamp: Date;
  applied: boolean;
}

export interface WatchSummary {
  dryRun: boolean;
  contract: string;
  symbol: string;
  scanned: number;
  found: number;
  applied: number;
  deposits: WatchedDeposit[];
}

@Injectable()
export class WatcherService {
  private readonly logger = new Logger(WatcherService.name);

  constructor(
    private readonly wallets: UserWalletsService,
    private readonly transactions: TransactionsService,
    private readonly tron: TronService,
    private readonly dataSource: DataSource,
  ) {}

  async scan(options: WatchOptions = {}): Promise<WatchSummary> {
    const contract = this.tron.defaultToken;
    const meta = await this.tron.getTokenMeta(contract);
    const dryRun = options.dryRun ?? false;
    const targets = await this.wallets.findActive();

    const deposits: WatchedDeposit[] = [];
    let applied = 0;

    for (const wallet of targets) {
      const since = await this.cursorFor(wallet);
      const transfers = await this.tron.getIncomingTrc20(wallet.address, contract, since);

      for (const transfer of transfers) {
        const record: WatchedDeposit = {
          address: wallet.address,
          txid: transfer.txid,
          contract,
          from: transfer.from,
          to: transfer.to,
          amount: transfer.amount.toString(),
          amountFormatted: formatUnits(transfer.amount, meta.decimals),
          blockTimestamp: new Date(transfer.blockTimestamp),
          applied: false,
        };

        if (!dryRun) {
          record.applied = await this.apply(wallet, contract, meta.symbol, meta.decimals, transfer);
          if (record.applied) {
            applied += 1;
            this.logger.log(
              `입금 감지 ${wallet.address} +${record.amountFormatted} ${meta.symbol} (${transfer.txid})`,
            );
          }
        }
        deposits.push(record);
      }
    }

    return {
      dryRun,
      contract,
      symbol: meta.symbol,
      scanned: targets.length,
      found: deposits.length,
      applied,
      deposits,
    };
  }

  private async cursorFor(wallet: UserWallet): Promise<number> {
    const row = await this.transactions.lastBlockTimestamp(wallet.id);
    return row?.max ? row.max.getTime() : wallet.createdAt.getTime();
  }

  private async apply(
    wallet: UserWallet,
    contract: string,
    tokenSymbol: string,
    tokenDecimals: number,
    transfer: Trc20Transfer,
  ): Promise<boolean> {
    return this.dataSource.transaction(async (manager) => {
      const isNew = await this.transactions.recordOnce(manager, {
        userWalletId: wallet.id,
        type: TransactionType.DEPOSIT,
        status: TransactionStatus.SUCCESS,
        address: wallet.address,
        contract,
        tokenSymbol,
        tokenDecimals,
        txid: transfer.txid,
        fromAddress: transfer.from,
        toAddress: transfer.to,
        amount: transfer.amount,
        blockTimestamp: new Date(transfer.blockTimestamp),
      });

      if (!isNew) {
        return false;
      }

      await manager
        .createQueryBuilder()
        .update(UserWallet)
        .set({ usdtAmount: () => 'usdt_amount + :amount' })
        .where('id = :id', { id: wallet.id })
        .setParameters({ amount: transfer.amount.toString() })
        .execute();

      return true;
    });
  }
}
