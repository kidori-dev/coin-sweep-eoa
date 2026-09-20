import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

import { DEFAULT_CHAIN } from '../contracts/entities/contract.entity';
import { ChainScanState } from './entities/chain-scan-state.entity';

/**
 * advisory lock 키. classid 는 'TRON' 의 ASCII(0x54524F4E), objid 는 스코프 번호다.
 * 세션 단위 락이라 연결이 끊기면 자동으로 풀린다 — 프로세스가 죽어도 락이 남지 않는다.
 */
const LOCK_CLASS = 0x54524f4e;
const LOCK_DEPOSIT_SCAN = 1;

@Injectable()
export class ScanStateService {
  private readonly logger = new Logger(ScanStateService.name);

  constructor(
    @InjectRepository(ChainScanState)
    private readonly repo: Repository<ChainScanState>,
  ) {}

  find(): Promise<ChainScanState | null> {
    return this.repo.findOne({ where: { chain: DEFAULT_CHAIN } });
  }

  /** 행이 없으면 fallbackBlock(보통 현재 확정 블록)에서 시작한다. 동시에 돌아도 행은 하나만 생긴다. */
  async loadOrCreate(fallbackBlock: number): Promise<ChainScanState> {
    const existing = await this.find();
    if (existing) {
      return existing;
    }

    await this.repo
      .createQueryBuilder()
      .insert()
      .into(ChainScanState)
      .values({ chain: DEFAULT_CHAIN, lastScannedBlock: fallbackBlock })
      .orIgnore()
      .execute();

    const created = await this.find();
    if (!created) {
      throw new Error('스캔 상태 행을 만들지 못했습니다.');
    }
    this.logger.log(`스캔 시작점을 블록 ${created.lastScannedBlock} 으로 잡았습니다.`);
    return created;
  }

  /**
   * 입금 반영과 같은 DB 트랜잭션에서 호출해야 커서만 앞서 나가 입금이 새는 창이 없다.
   * GREATEST 라 동시에 돈 다른 스캔이 더 멀리 밀어 놓은 커서를 되돌리지 않는다.
   */
  async advance(manager: EntityManager, block: number): Promise<void> {
    await manager
      .createQueryBuilder()
      .update(ChainScanState)
      .set({ lastScannedBlock: () => 'GREATEST(last_scanned_block, :block)' })
      .where('chain = :chain', { chain: DEFAULT_CHAIN })
      .setParameter('block', block)
      .execute();
  }

  /**
   * 입금 스캔을 한 번에 하나만 돌게 묶는다. 이미 누가 잡고 있으면 fn 을 실행하지 않고 null.
   *
   * 워커를 두 개 띄우거나, 워커가 도는 중에 사람이 tron:watch 를 치거나, 크론이 겹쳐 뜨면
   * 같은 블록을 두 번 조회하게 된다. 이중 반영은 유니크 인덱스가 막아 주지만 RPC 는 그대로
   * 두 배로 나간다. backfill 은 메인 스캔과 **동시에 도는 게 설계 의도**라 이 락을 잡지 않는다.
   */
  async withScanLock<T>(fn: () => Promise<T>): Promise<T | null> {
    const runner = this.repo.manager.connection.createQueryRunner();
    await runner.connect();
    try {
      const rows = (await runner.query('SELECT pg_try_advisory_lock($1, $2) AS locked', [
        LOCK_CLASS,
        LOCK_DEPOSIT_SCAN,
      ])) as { locked: boolean }[];

      if (!rows[0]?.locked) {
        return null;
      }
      try {
        return await fn();
      } finally {
        await runner.query('SELECT pg_advisory_unlock($1, $2)', [LOCK_CLASS, LOCK_DEPOSIT_SCAN]);
      }
    } finally {
      await runner.release();
    }
  }

  /** 커서를 직접 옮긴다. 과거 구간 재조회는 tron:backfill 을 쓰고, 이건 복구용이다. */
  async moveTo(block: number): Promise<void> {
    await this.repo.update({ chain: DEFAULT_CHAIN }, { lastScannedBlock: block });
    this.logger.warn(`스캔 커서를 블록 ${block} 으로 옮겼습니다.`);
  }
}
