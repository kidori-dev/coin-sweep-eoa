import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';

import { TronService } from '../tron/tron.service';
import { Contract, DEFAULT_CHAIN, NATIVE_REF } from './entities/contract.entity';

export interface RegisterContractInput {
  address: string;
  symbol: string;
  decimals: number;
  minSweepAmount?: string;
}

/**
 * contract 테이블은 사실상 불변 참조 데이터라 프로세스 안에서 캐시해 둔다.
 * 행을 바꾸는 경로(register/ensureNative)는 모두 이 서비스를 지나므로 그때 캐시를 비운다.
 */
@Injectable()
export class ContractsService {
  private readonly logger = new Logger(ContractsService.name);
  private byId = new Map<string, Contract>();
  private byRef = new Map<string, Contract>();

  constructor(
    @InjectRepository(Contract)
    private readonly repo: Repository<Contract>,
    private readonly tron: TronService,
  ) {}

  private cache(contract: Contract): Contract {
    this.byId.set(contract.id, contract);
    this.byRef.set(contract.ref, contract);
    return contract;
  }

  private invalidate(): void {
    this.byId = new Map();
    this.byRef = new Map();
  }

  findAll(): Promise<Contract[]> {
    return this.repo.find({ order: { isNative: 'ASC', symbol: 'ASC' } });
  }

  /** 등록된 TRC20 전부. 비활성도 포함한다 — 남아 있는 잔액은 여전히 보여야 한다 */
  findTokens(): Promise<Contract[]> {
    return this.repo.find({
      where: { chain: DEFAULT_CHAIN, isNative: false },
      order: { symbol: 'ASC' },
    });
  }

  /**
   * 입금 감시와 자동 집금의 대상. 등록된 활성 TRC20 전부.
   * 스캔 위치가 contract 에서 빠지면서 "감시 대상" 과 "집금 대상" 조건이 같아졌다.
   */
  findActiveTokens(): Promise<Contract[]> {
    return this.repo.find({
      where: { chain: DEFAULT_CHAIN, isActive: true, isNative: false },
      order: { symbol: 'ASC' },
    });
  }

  async findByIdOrFail(id: string): Promise<Contract> {
    const cached = this.byId.get(id);
    if (cached) {
      return cached;
    }
    const found = await this.repo.findOne({ where: { id } });
    if (!found) {
      throw new NotFoundException(`컨트랙트를 찾을 수 없습니다: ${id}`);
    }
    return this.cache(found);
  }

  async findNative(): Promise<Contract> {
    const found = await this.repo.findOne({ where: { chain: DEFAULT_CHAIN, address: IsNull() } });
    if (!found) {
      throw new NotFoundException(
        '네이티브 TRX 컨트랙트 행이 없습니다. `npm run cli -- db:seed` 를 먼저 실행하세요.',
      );
    }
    return this.cache(found);
  }

  /** 주소 문자열 또는 "TRX" 표식을 행으로 바꾼다. 등록되지 않은 주소면 404. */
  async resolveOrFail(ref: string): Promise<Contract> {
    const cached = this.byRef.get(ref);
    if (cached) {
      return cached;
    }
    if (ref === NATIVE_REF) {
      return this.findNative();
    }
    const found = await this.repo.findOne({ where: { chain: DEFAULT_CHAIN, address: ref } });
    if (!found) {
      throw new NotFoundException(
        `등록되지 않은 컨트랙트입니다: ${ref}. ` +
          '`npm run cli -- tron:contract-add -c <주소>` 로 먼저 등록하세요.',
      );
    }
    return this.cache(found);
  }

  /**
   * 모르는 주소면 체인에서 symbol/decimals 를 읽어 등록하고 돌려준다.
   * 수동 집금처럼 "아직 등록 안 한 토큰"을 즉석에서 다뤄야 하는 경로용.
   */
  async resolveOrRegister(ref: string): Promise<Contract> {
    try {
      return await this.resolveOrFail(ref);
    } catch (err) {
      if (!(err instanceof NotFoundException) || ref === NATIVE_REF) {
        throw err;
      }
    }
    const meta = await this.tron.getTokenMeta(ref);
    this.logger.log(`컨트랙트 자동 등록 ${meta.symbol} (${ref}) decimals=${meta.decimals}`);
    return this.register({ address: ref, symbol: meta.symbol, decimals: meta.decimals });
  }

  /** 체인에서 메타데이터를 읽어 등록한다. 이미 있으면 symbol/decimals 를 체인 값으로 맞춘다. */
  async registerFromChain(
    address: string,
    extra: Omit<RegisterContractInput, 'address' | 'symbol' | 'decimals'> = {},
  ): Promise<Contract> {
    const meta = await this.tron.getTokenMeta(address);
    return this.register({ ...extra, address, symbol: meta.symbol, decimals: meta.decimals });
  }

  async register(input: RegisterContractInput): Promise<Contract> {
    const existing = await this.repo.findOne({
      where: { chain: DEFAULT_CHAIN, address: input.address },
    });

    if (existing) {
      existing.symbol = input.symbol;
      existing.decimals = input.decimals;
      if (input.minSweepAmount !== undefined) {
        existing.minSweepAmount = input.minSweepAmount;
      }
      const saved = await this.repo.save(existing);
      this.invalidate();
      return saved;
    }

    // 등록하는 순간부터 감시 대상이 된다. 과거 입금은 tron:backfill 로 따로 훑는다.
    const saved = await this.repo.save(
      this.repo.create({
        chain: DEFAULT_CHAIN,
        address: input.address,
        symbol: input.symbol,
        decimals: input.decimals,
        isNative: false,
        isActive: true,
        minSweepAmount: input.minSweepAmount ?? '0',
      }),
    );
    this.invalidate();
    return saved;
  }

  /** 네이티브 TRX 행을 보장한다. 시드에서 한 번 부르면 된다. */
  async ensureNative(): Promise<Contract> {
    const existing = await this.repo.findOne({
      where: { chain: DEFAULT_CHAIN, address: IsNull() },
    });
    if (existing) {
      return existing;
    }
    const saved = await this.repo.save(
      this.repo.create({
        chain: DEFAULT_CHAIN,
        address: null,
        symbol: NATIVE_REF,
        decimals: 6,
        isNative: true,
        isActive: true,
      }),
    );
    this.invalidate();
    return saved;
  }
}
