import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { HdWalletService } from '../tron/hd-wallet.service';
import { TronService } from '../tron/tron.service';
import { UserWallet } from './entities/user-wallet.entity';

export interface AddressBalance {
  address: string;
  trxSun: bigint;
  token: bigint;
}

@Injectable()
export class UserWalletsService {
  private readonly logger = new Logger(UserWalletsService.name);

  constructor(
    @InjectRepository(UserWallet)
    private readonly repo: Repository<UserWallet>,
    private readonly dataSource: DataSource,
    private readonly hdWallet: HdWalletService,
    private readonly tron: TronService,
  ) {}

  async issue(userRef?: string | null): Promise<UserWallet> {
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(UserWallet);

      await manager.query(
        `LOCK TABLE ${manager.getRepository(UserWallet).metadata.tableName} IN SHARE ROW EXCLUSIVE MODE`,
      );

      const last = await repo
        .createQueryBuilder('d')
        .select('MAX(d.derivationIndex)', 'max')
        .getRawOne<{ max: number | null }>();

      let nextIndex = (last?.max ?? this.hdWallet.getMain().index) + 1;
      if (this.hdWallet.isMainIndex(nextIndex)) {
        nextIndex += 1;
      }

      const wallet = this.hdWallet.derive(nextIndex);
      const saved = await repo.save(
        repo.create({
          address: wallet.address,
          derivationIndex: wallet.index,
          userRef: userRef ?? null,
        }),
      );

      this.logger.log(`issued deposit address ${saved.address} (index ${saved.derivationIndex})`);
      return saved;
    });
  }

  findAll(): Promise<UserWallet[]> {
    return this.repo.find({ order: { derivationIndex: 'ASC' } });
  }

  findActive(): Promise<UserWallet[]> {
    return this.repo.find({ where: { isActive: true }, order: { derivationIndex: 'ASC' } });
  }

  async findByIdOrFail(id: string): Promise<UserWallet> {
    const found = await this.repo.findOne({ where: { id } });
    if (!found) {
      throw new NotFoundException(`입금주소를 찾을 수 없습니다: ${id}`);
    }
    return found;
  }

  async findByAddressOrFail(address: string): Promise<UserWallet> {
    const found = await this.repo.findOne({ where: { address } });
    if (!found) {
      throw new NotFoundException(`입금주소를 찾을 수 없습니다: ${address}`);
    }
    return found;
  }

  async getBalance(address: string, contract?: string): Promise<AddressBalance> {
    const [trxSun, token] = await Promise.all([
      this.tron.getTrxBalance(address),
      this.tron.getTokenBalance(address, contract),
    ]);
    return { address, trxSun, token };
  }

  markSwept(id: string): Promise<unknown> {
    return this.repo.update(id, { lastSweptAt: new Date() });
  }
}
