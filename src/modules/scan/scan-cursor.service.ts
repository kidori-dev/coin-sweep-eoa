import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, Repository } from 'typeorm';

import { ScanCursor, ScanScope } from './entities/scan-cursor.entity';
import { AdvanceCursorInput, CursorTarget, RewindCursorInput } from './scan.types';

@Injectable()
export class ScanCursorService {
  private readonly logger = new Logger(ScanCursorService.name);

  constructor(
    @InjectRepository(ScanCursor)
    private readonly repo: Repository<ScanCursor>,
  ) {}

  /** 커서가 없으면 fallbackAt 으로 만든다. 동시에 두 스캔이 돌아도 행은 하나만 생긴다. */
  async loadOrCreate(target: CursorTarget, fallbackAt: Date): Promise<ScanCursor> {
    const userWalletId = target.userWalletId ?? null;
    const contract = target.contract ?? null;

    const existing = await this.find(target);
    if (existing) {
      return existing;
    }

    await this.repo
      .createQueryBuilder()
      .insert()
      .into(ScanCursor)
      .values({ scope: target.scope, userWalletId, contract, scannedThroughAt: fallbackAt })
      .orIgnore()
      .execute();

    const created = await this.find(target);
    if (!created) {
      throw new Error(`스캔 커서를 만들지 못했습니다: ${target.scope}/${userWalletId}/${contract}`);
    }
    return created;
  }

  find(target: CursorTarget): Promise<ScanCursor | null> {
    return this.repo.findOne({
      where: {
        scope: target.scope,
        userWalletId: target.userWalletId ?? IsNull(),
        contract: target.contract ?? IsNull(),
      },
    });
  }

  findAll(scope?: ScanScope): Promise<ScanCursor[]> {
    return this.repo.find({
      where: scope ? { scope } : {},
      order: { scope: 'ASC', updatedAt: 'DESC' },
    });
  }

  /**
   * 입금 반영과 같은 DB 트랜잭션에서 호출해야 한다. 커서만 전진하고 입금이 날아가는 창을 없앤다.
   * GREATEST 로 묶어 두어 동시에 돈 다른 스캔이 더 멀리 밀어 놓은 커서를 되돌리지 않는다.
   */
  async advance(manager: EntityManager, id: string, input: AdvanceCursorInput): Promise<void> {
    await manager
      .createQueryBuilder()
      .update(ScanCursor)
      .set({
        scannedThroughAt: () =>
          'GREATEST(scanned_through_at, CAST(:scannedThroughAt AS timestamptz))',
        lastSeenTxid: input.lastSeenTxid ?? null,
        truncated: input.truncated ?? false,
        lastRunAt: new Date(),
        lastSuccessAt: new Date(),
        lastError: null,
      })
      .where('id = :id', { id })
      .setParameters({ scannedThroughAt: input.scannedThroughAt.toISOString() })
      .execute();
  }

  async markFailed(id: string, error: string): Promise<void> {
    await this.repo.update(id, { lastRunAt: new Date(), lastError: error });
  }

  /**
   * 커서를 강제로 되감아 과거 구간을 다시 훑게 한다. 이미 기록된 입금은 txid 유니크 인덱스에
   * 걸려 다시 반영되지 않으므로 잔고가 두 번 오르지는 않는다.
   */
  async rewind(input: RewindCursorInput): Promise<number> {
    const qb = this.repo
      .createQueryBuilder()
      .update(ScanCursor)
      .set({ scannedThroughAt: input.to, truncated: false, lastSeenTxid: null })
      .where('scope = :scope', { scope: input.scope });

    if (input.userWalletId !== undefined) {
      qb.andWhere(
        input.userWalletId === null ? 'user_wallet_id IS NULL' : 'user_wallet_id = :userWalletId',
        { userWalletId: input.userWalletId },
      );
    }
    if (input.contract !== undefined) {
      qb.andWhere(input.contract === null ? 'contract IS NULL' : 'contract = :contract', {
        contract: input.contract,
      });
    }

    const result = await qb.execute();
    const affected = result.affected ?? 0;
    this.logger.warn(
      `스캔 커서 되감기 scope=${input.scope} → ${input.to.toISOString()} (${affected} rows)`,
    );
    return affected;
  }
}
