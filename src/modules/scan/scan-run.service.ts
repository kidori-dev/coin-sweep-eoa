import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ScanScope } from './entities/scan-cursor.entity';
import { ScanRun, ScanRunStatus, ScanTrigger } from './entities/scan-run.entity';
import { FindRunsOptions, FinishRunInput, StartRunInput } from './scan.types';

@Injectable()
export class ScanRunService {
  private readonly logger = new Logger(ScanRunService.name);

  constructor(
    @InjectRepository(ScanRun)
    private readonly repo: Repository<ScanRun>,
  ) {}

  start(input: StartRunInput): Promise<ScanRun> {
    return this.repo.save(
      this.repo.create({
        scope: input.scope,
        trigger: input.trigger ?? ScanTrigger.API,
        dryRun: input.dryRun ?? false,
        contract: input.contract ?? null,
        windowFrom: input.windowFrom ?? null,
        windowTo: input.windowTo ?? null,
        status: ScanRunStatus.RUNNING,
      }),
    );
  }

  async finish(id: string, input: FinishRunInput): Promise<void> {
    await this.repo.update(id, {
      status: ScanRunStatus.SUCCESS,
      walletsScanned: input.walletsScanned ?? 0,
      found: input.found ?? 0,
      applied: input.applied ?? 0,
      pending: input.pending ?? 0,
      failed: input.failed ?? 0,
      windowFrom: input.windowFrom ?? null,
      windowTo: input.windowTo ?? null,
      finishedAt: new Date(),
    });
  }

  async fail(id: string, error: string, partial: FinishRunInput = {}): Promise<void> {
    await this.repo.update(id, {
      status: ScanRunStatus.FAILED,
      walletsScanned: partial.walletsScanned ?? 0,
      found: partial.found ?? 0,
      applied: partial.applied ?? 0,
      pending: partial.pending ?? 0,
      failed: partial.failed ?? 0,
      error,
      finishedAt: new Date(),
    });
    this.logger.error(`scan run ${id} 실패: ${error}`);
  }

  findAll(options: FindRunsOptions = {}): Promise<ScanRun[]> {
    const where: Record<string, unknown> = {};
    if (options.scope) {
      where.scope = options.scope;
    }
    if (options.status) {
      where.status = options.status;
    }
    return this.repo.find({
      where,
      order: { startedAt: 'DESC' },
      take: options.limit ?? 50,
    });
  }

  /** 프로세스가 중간에 죽으면 running 인 채로 남는다. 모니터링용. */
  findStale(scope: ScanScope, olderThanMs: number): Promise<ScanRun[]> {
    return this.repo
      .createQueryBuilder('r')
      .where('r.scope = :scope', { scope })
      .andWhere('r.status = :status', { status: ScanRunStatus.RUNNING })
      .andWhere('r.startedAt < :cutoff', { cutoff: new Date(Date.now() - olderThanMs) })
      .orderBy('r.startedAt', 'DESC')
      .getMany();
  }
}
