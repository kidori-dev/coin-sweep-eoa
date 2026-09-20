import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 스캔 위치를 컨트랙트에서 떼어내 체인 단위 한 행으로 옮긴다.
 *
 * contract.last_scanned_block 은 정상 상태에서 모든 행이 같은 값을 들고 있었다 — 한 개의
 * 사실을 N개 행에 복사해 둔 셈이다. 더 나쁜 건, 컨트랙트 하나를 과거 블록부터 등록하면
 * 스캔 시작점이 MIN 을 따라 과거로 끌려가서 **다른 자산의 신규 입금까지 멈췄다는 점**이다
 * (하루치 백필이면 약 한 시간). 조용히 멈춰서 알아채기도 어려웠다.
 *
 * 위치는 스캐너의 상태이고 "이 자산을 보는가" 는 자산의 속성이라, 둘을 나눈다.
 * 감시 대상은 이제 is_active AND NOT is_native 가 답한다 — 자동 집금 대상과 같은 조건이다.
 * 과거 구간 재조회는 커서를 건드리지 않는 tron:backfill 이 맡는다.
 */
export class ChainScanState1790726400000 implements MigrationInterface {
  name = 'ChainScanState1790726400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "chain_scan_state" (
        "chain" character varying(32) NOT NULL,
        "last_scanned_block" bigint NOT NULL,
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_chain_scan_state" PRIMARY KEY ("chain")
      )
    `);

    // 가장 뒤처진 커서를 이어받는다. 앞선 값을 쓰면 그 사이 구간을 건너뛰게 된다.
    // 감시 중인 컨트랙트가 하나도 없으면 행을 만들지 않고, 첫 스캔이 확정 블록에서 시작한다.
    await queryRunner.query(`
      INSERT INTO "chain_scan_state" ("chain", "last_scanned_block")
      SELECT c."chain", MIN(c."last_scanned_block")
      FROM "contract" c
      WHERE c."last_scanned_block" IS NOT NULL
      GROUP BY c."chain"
    `);

    await queryRunner.query(`ALTER TABLE "contract" DROP COLUMN "last_scanned_block"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "contract" ADD "last_scanned_block" bigint`);
    // 되돌릴 때는 감시 중이던 자산(활성 TRC20)에만 커서를 되살린다.
    await queryRunner.query(`
      UPDATE "contract" c
      SET "last_scanned_block" = s."last_scanned_block"
      FROM "chain_scan_state" s
      WHERE s."chain" = c."chain" AND c."is_native" = false AND c."is_active" = true
    `);
    await queryRunner.query(`DROP TABLE "chain_scan_state"`);
  }
}
