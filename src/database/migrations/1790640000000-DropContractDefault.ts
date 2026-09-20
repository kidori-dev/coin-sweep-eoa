import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * contract.is_default 제거.
 *
 * 원래는 "입금 감시와 자동 집금의 기준 자산" 이었는데, 둘 다 등록된 자산 전부를 도는 쪽으로
 * 바뀌면서 그 역할이 사라졌다 — 스캔 대상은 last_scanned_block 이, 집금 대상은 is_active 가 고른다.
 * 남아 있던 쓰임은 "잔액 조회에서 어느 토큰을 보여줄지" 하나뿐이었고, 그건 들고 있는 자산을
 * 전부 돌려주면 되는 일이라 기준을 고를 필요가 없다.
 */
export class DropContractDefault1790640000000 implements MigrationInterface {
  name = 'DropContractDefault1790640000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "UQ_contract_default"`);
    await queryRunner.query(`ALTER TABLE "contract" DROP COLUMN "is_default"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "contract" ADD "is_default" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_contract_default" ON "contract" ("chain") WHERE "is_default"
    `);
    // 되돌릴 때 어느 행이 기준이었는지는 알 수 없다. 가장 먼저 등록된 토큰으로 되살린다.
    await queryRunner.query(`
      UPDATE "contract" SET "is_default" = true
      WHERE "id" = (
        SELECT "id" FROM "contract"
        WHERE "is_native" = false
        ORDER BY "created_at" ASC
        LIMIT 1
      )
    `);
  }
}
