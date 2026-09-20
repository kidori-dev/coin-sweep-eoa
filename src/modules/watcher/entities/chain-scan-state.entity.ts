import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/** pg 드라이버가 bigint 를 문자열로 돌려주므로 블록 번호는 숫자로 변환해서 쓴다 */
const blockNumberTransformer = {
  to: (value: number): number => value,
  from: (value: string): number => Number(value),
};

/**
 * 블록 스캐너가 어디까지 훑었는지. **체인당 한 행**이다.
 *
 * 이 값은 스캐너의 상태이지 자산의 속성이 아니다. contract 마다 커서를 두면 정상 상태에서
 * 모든 행이 같은 값을 들고 있게 되고(같은 사실의 복사본 N개), 컨트랙트 하나를 과거부터
 * 등록하는 순간 전체 스캔 구간이 과거로 끌려가 **다른 자산의 신규 입금까지 멈춘다.**
 *
 * 그래서 위치는 여기 한 행에만 두고, "이 자산을 보는가" 는 contract 의
 * is_active / is_native 가 답한다. 과거 구간을 다시 훑는 일은 이 커서를 건드리지 않는
 * 별도 구간 스캔(tron:backfill)이 맡는다.
 */
@Entity('chain_scan_state')
export class ChainScanState {
  @PrimaryColumn({ type: 'varchar', length: 32 })
  chain!: string;

  /** 이 블록까지는 빠짐없이 훑었다. 다음 스캔은 +1 부터 */
  @Column({ name: 'last_scanned_block', type: 'bigint', transformer: blockNumberTransformer })
  lastScannedBlock!: number;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
