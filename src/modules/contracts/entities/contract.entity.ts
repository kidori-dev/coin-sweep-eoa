import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/** 네이티브 자산을 가리킬 때 API·CLI 에서 컨트랙트 주소 자리에 넣는 표식 */
export const NATIVE_REF = 'TRX';

export const DEFAULT_CHAIN = 'tron';

/**
 * 우리가 다루는 자산 한 건. 토큰 주소를 env 문자열로 들고 다니면 오타 하나에 조용히 별개의
 * 이력이 생기므로, 주소를 한 행으로 고정하고 나머지 테이블은 FK 로 이 행을 가리킨다.
 *
 * 네이티브 TRX 도 address = NULL 인 한 행으로 등록한다. 다만 TRX 전송은 컨트랙트 이벤트가
 * 아니라 블록 바디에 있어서 로그 스캔으로는 잡히지 않는다 — TRX 행은 집금·이력의 FK 대상일
 * 뿐이고 입금 감시 대상이 아니다.
 *
 * 어디까지 훑었는지는 여기 두지 않는다. 그건 스캐너의 상태라 chain_scan_state 가 한 행으로
 * 들고 있고, 이 테이블은 "무엇을 보는가" 만 답한다 — 감시·집금 대상은 is_active 와 is_native.
 *
 * 마이그레이션이 거는 인덱스 (엔티티로는 표현되지 않는다):
 *   UQ_contract_address : (chain, address) UNIQUE NULLS NOT DISTINCT — 네이티브 행도 체인당 하나
 */
@Entity('contract')
@Index('UQ_contract_address', ['chain', 'address'], { unique: true })
export class Contract {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 32, default: DEFAULT_CHAIN })
  chain!: string;

  /** null 이면 네이티브 자산(TRX). 그 외에는 TRC20 컨트랙트 주소 */
  @Column({ type: 'varchar', length: 64, nullable: true })
  address!: string | null;

  @Column({ type: 'varchar', length: 32 })
  symbol!: string;

  @Column({ type: 'integer' })
  decimals!: number;

  @Column({ name: 'is_native', type: 'boolean', default: false })
  isNative!: boolean;

  /** false 면 입금 감시와 자동 집금에서 뺀다. 이력은 FK 로 남으므로 삭제 대신 이 플래그를 쓴다 */
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  /** 자동 집금 최소 금액 (최소 단위). 이 미만은 그대로 둔다 */
  @Column({ name: 'min_sweep_amount', type: 'numeric', precision: 38, scale: 0, default: 0 })
  minSweepAmount!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  /** API·CLI 에 노출하는 식별자. 네이티브는 주소가 없으므로 'TRX' 로 보여준다 */
  get ref(): string {
    return this.address ?? NATIVE_REF;
  }
}
