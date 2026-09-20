import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 입금 감지를 계정별 조회에서 블록 스캔으로 바꾼다.
 *
 *  - contract.last_scanned_block : "이 블록까지 훑었다". null 이면 스캔 대상이 아니다.
 *    네이티브 TRX 는 전송이 로그로 남지 않아(금액·상대주소가 블록 바디에만 있다) 여기서 빠진다.
 *  - scan_cursor / scan_run 제거. 지갑 × 컨트랙트마다 있던 커서가 컨트랙트당 한 칸으로 줄고,
 *    타임스탬프 커서라서 필요했던 truncated / last_seen_txid 도 함께 사라진다.
 *  - user_wallet_balance : amount → deposit_amount, sweep_amount 추가.
 *    둘 다 단조 증가하는 누계이고, 그 차이가 미집금 잔액이다. 이 값으로 집금 대상을 고르므로
 *    지갑마다 balanceOf 를 쏠 필요가 없어진다.
 *  - transactions : block_number / log_index 추가, 입금 유니크를 log_index 까지 넓힌다.
 *    한 트랜잭션이 같은 주소로 서로 다른 토큰을 보내거나 같은 토큰을 두 번 보낼 수 있어서
 *    (txid, user_wallet_id) 만으로는 두 번째 건이 조용히 사라진다.
 */
export class BlockScan1790553600000 implements MigrationInterface {
  name = 'BlockScan1790553600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "contract" ADD "last_scanned_block" bigint`);

    // 커서 값은 체인 현재 높이에 달려 있어 마이그레이션이 정할 수 없다.
    // db:seed 나 tron:contract-add 가 확정 블록을 읽어 채운다 (그때까지 스캔은 멈춰 있다).
    await queryRunner.query(`DROP TABLE "scan_cursor"`);
    await queryRunner.query(`DROP TABLE "scan_run"`);
    await queryRunner.query(`DROP TYPE "scan_run_trigger_enum"`);
    await queryRunner.query(`DROP TYPE "scan_run_status_enum"`);
    await queryRunner.query(`DROP TYPE "scan_scope_enum"`);

    await queryRunner.query(
      `ALTER TABLE "user_wallet_balance" RENAME COLUMN "amount" TO "deposit_amount"`,
    );
    await queryRunner.query(`
      ALTER TABLE "user_wallet_balance"
      ADD "sweep_amount" numeric(38,0) NOT NULL DEFAULT 0
    `);
    // 이미 집금된 분을 이력에서 복원한다. 안 하면 전부 미집금으로 보여 재집금 대상이 된다.
    await queryRunner.query(`
      UPDATE "user_wallet_balance" b
      SET "sweep_amount" = s."total"
      FROM (
        SELECT t."user_wallet_id", t."contract_id", SUM(t."amount") AS "total"
        FROM "transactions" t
        WHERE t."type" = 'sweep' AND t."status" = 'success'
        GROUP BY t."user_wallet_id", t."contract_id"
      ) s
      WHERE s."user_wallet_id" = b."user_wallet_id" AND s."contract_id" = b."contract_id"
    `);

    await queryRunner.query(`ALTER TABLE "transactions" ADD "block_number" bigint`);
    await queryRunner.query(`ALTER TABLE "transactions" ADD "log_index" integer`);

    // 입금만 유니크를 건다. 집금은 append-only 이고 실패 건은 txid 자체가 없다.
    await queryRunner.query(`DROP INDEX "UQ_transactions_tx"`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_transactions_deposit" ON "transactions"
        ("txid", "user_wallet_id", "contract_id", "log_index")
        WHERE "type" = 'deposit'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "UQ_transactions_deposit"`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_transactions_tx" ON "transactions" ("txid", "user_wallet_id")
    `);
    await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN "log_index"`);
    await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN "block_number"`);

    await queryRunner.query(`ALTER TABLE "user_wallet_balance" DROP COLUMN "sweep_amount"`);
    await queryRunner.query(
      `ALTER TABLE "user_wallet_balance" RENAME COLUMN "deposit_amount" TO "amount"`,
    );

    await queryRunner.query(`CREATE TYPE "scan_scope_enum" AS ENUM('deposit', 'sweep')`);
    await queryRunner.query(
      `CREATE TYPE "scan_run_status_enum" AS ENUM('running', 'success', 'failed')`,
    );
    await queryRunner.query(`CREATE TYPE "scan_run_trigger_enum" AS ENUM('api', 'cli')`);
    await queryRunner.query(`
      CREATE TABLE "scan_cursor" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "scope" "scan_scope_enum" NOT NULL,
        "user_wallet_id" uuid,
        "contract_id" uuid NOT NULL,
        "scanned_through_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "last_seen_txid" character varying(64),
        "truncated" boolean NOT NULL DEFAULT false,
        "last_run_at" TIMESTAMP WITH TIME ZONE,
        "last_success_at" TIMESTAMP WITH TIME ZONE,
        "last_error" text,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_scan_cursor_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_scan_cursor_user_wallet" FOREIGN KEY ("user_wallet_id")
          REFERENCES "user_wallet"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_scan_cursor_contract" FOREIGN KEY ("contract_id")
          REFERENCES "contract"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_scan_cursor_target" ON "scan_cursor"
        ("scope", "user_wallet_id", "contract_id") NULLS NOT DISTINCT
    `);
    await queryRunner.query(`
      CREATE TABLE "scan_run" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "scope" "scan_scope_enum" NOT NULL,
        "status" "scan_run_status_enum" NOT NULL DEFAULT 'running',
        "trigger" "scan_run_trigger_enum" NOT NULL DEFAULT 'api',
        "dry_run" boolean NOT NULL DEFAULT false,
        "contract_id" uuid,
        "window_from" TIMESTAMP WITH TIME ZONE,
        "window_to" TIMESTAMP WITH TIME ZONE,
        "wallets_scanned" integer NOT NULL DEFAULT 0,
        "found" integer NOT NULL DEFAULT 0,
        "applied" integer NOT NULL DEFAULT 0,
        "pending" integer NOT NULL DEFAULT 0,
        "failed" integer NOT NULL DEFAULT 0,
        "error" text,
        "started_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "finished_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_scan_run_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_scan_run_contract" FOREIGN KEY ("contract_id")
          REFERENCES "contract"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_scan_run_scope_started" ON "scan_run" ("scope", "started_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_scan_run_contract_id" ON "scan_run" ("contract_id")`,
    );

    await queryRunner.query(`ALTER TABLE "contract" DROP COLUMN "last_scanned_block"`);
  }
}
