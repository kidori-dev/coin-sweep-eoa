import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddScanTables1790380800000 implements MigrationInterface {
  name = 'AddScanTables1790380800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
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
        "contract" character varying(64),
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
          REFERENCES "user_wallet"("id") ON DELETE CASCADE
      )
    `);
    // NULLS NOT DISTINCT (PG15+): user_wallet_id / contract 가 NULL 인 전역·네이티브 커서도
    // 스코프당 한 행만 존재하도록 막는다. 기본 동작이면 NULL 끼리는 충돌하지 않아 중복 생성된다.
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_scan_cursor_target" ON "scan_cursor"
        ("scope", "user_wallet_id", "contract") NULLS NOT DISTINCT
    `);

    await queryRunner.query(`
      CREATE TABLE "scan_run" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "scope" "scan_scope_enum" NOT NULL,
        "status" "scan_run_status_enum" NOT NULL DEFAULT 'running',
        "trigger" "scan_run_trigger_enum" NOT NULL DEFAULT 'api',
        "dry_run" boolean NOT NULL DEFAULT false,
        "contract" character varying(64),
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
        CONSTRAINT "PK_scan_run_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_scan_run_scope_started" ON "scan_run" ("scope", "started_at")`,
    );

    // 이미 입금 이력이 있는 지갑은 마지막 입금 시각을 커서로 심어, 커서 방식으로 넘어가면서
    // 과거 입금을 통째로 다시 훑지 않게 한다. 입금이 없던 지갑은 첫 스캔 때 생성 시각으로 생긴다.
    await queryRunner.query(`
      INSERT INTO "scan_cursor" ("scope", "user_wallet_id", "contract", "scanned_through_at")
      SELECT 'deposit', t."user_wallet_id", t."contract", MAX(t."block_timestamp")
      FROM "transactions" t
      WHERE t."type" = 'deposit' AND t."block_timestamp" IS NOT NULL
      GROUP BY t."user_wallet_id", t."contract"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "scan_run"`);
    await queryRunner.query(`DROP TABLE "scan_cursor"`);
    await queryRunner.query(`DROP TYPE "scan_run_trigger_enum"`);
    await queryRunner.query(`DROP TYPE "scan_run_status_enum"`);
    await queryRunner.query(`DROP TYPE "scan_scope_enum"`);
  }
}
