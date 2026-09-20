import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';

import { HdWalletService } from '../tron/hd-wallet.service';
import { UserWalletBalance } from './entities/user-wallet-balance.entity';
import { UserWallet } from './entities/user-wallet.entity';

@Injectable()
export class UserWalletsService {
  private readonly logger = new Logger(UserWalletsService.name);

  constructor(
    @InjectRepository(UserWallet)
    private readonly repo: Repository<UserWallet>,
    @InjectRepository(UserWalletBalance)
    private readonly balances: Repository<UserWalletBalance>,
    private readonly dataSource: DataSource,
    private readonly hdWallet: HdWalletService,
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

  /** 지갑별 자산 잔고를 userWalletId 로 묶어 돌려준다 */
  async findBalanceMap(userWalletIds: string[]): Promise<Map<string, UserWalletBalance[]>> {
    const grouped = new Map<string, UserWalletBalance[]>();
    if (userWalletIds.length === 0) {
      return grouped;
    }
    const rows = await this.balances.find({
      where: { userWalletId: In(userWalletIds) },
      relations: { contract: true },
    });
    for (const row of rows) {
      const list = grouped.get(row.userWalletId);
      if (list) {
        list.push(row);
      } else {
        grouped.set(row.userWalletId, [row]);
      }
    }
    return grouped;
  }

  /**
   * 집금 대상. 미집금 잔액(deposit_amount - sweep_amount)이 기준액 이상인 행만 고른다.
   * 지갑마다 balanceOf 를 쏘던 것을 이 쿼리 한 방이 대신하므로, 체인 호출이
   * O(전체 지갑) 에서 O(집금 대상) 으로 줄어든다.
   */
  findSweepCandidates(contractId: string, minAmount: string): Promise<UserWalletBalance[]> {
    return this.balances
      .createQueryBuilder('b')
      .innerJoinAndSelect('b.userWallet', 'w')
      .where('b.contractId = :contractId', { contractId })
      .andWhere('w.isActive = true')
      .andWhere('b.depositAmount - b.sweepAmount > 0')
      .andWhere('b.depositAmount - b.sweepAmount >= CAST(:minAmount AS numeric)', { minAmount })
      .orderBy('w.derivationIndex', 'ASC')
      .getMany();
  }

  /**
   * 입금 반영. 호출자의 DB 트랜잭션 안에서 실행해야 한다.
   * 잔고 행은 첫 입금 때 생기므로 지갑 발급 시점에 자산별 행을 미리 만들어 둘 필요가 없다.
   */
  async credit(
    manager: EntityManager,
    userWalletId: string,
    contractId: string,
    amount: bigint,
  ): Promise<void> {
    await manager.query(
      `INSERT INTO "user_wallet_balance" ("user_wallet_id", "contract_id", "deposit_amount")
       VALUES ($1, $2, $3)
       ON CONFLICT ("user_wallet_id", "contract_id")
       DO UPDATE SET "deposit_amount" = "user_wallet_balance"."deposit_amount" + EXCLUDED."deposit_amount",
                     "updated_at" = now()`,
      [userWalletId, contractId, amount.toString()],
    );
  }

  /** 집금 성공분을 누계에 더한다. 이 값이 올라가야 다음 집금 후보에서 빠진다. */
  async recordSweep(userWalletId: string, contractId: string, amount: bigint): Promise<void> {
    await this.balances.query(
      `INSERT INTO "user_wallet_balance" ("user_wallet_id", "contract_id", "sweep_amount", "last_swept_at")
       VALUES ($1, $2, $3, now())
       ON CONFLICT ("user_wallet_id", "contract_id")
       DO UPDATE SET "sweep_amount" = "user_wallet_balance"."sweep_amount" + EXCLUDED."sweep_amount",
                     "last_swept_at" = now(),
                     "updated_at" = now()`,
      [userWalletId, contractId, amount.toString()],
    );
  }
}
