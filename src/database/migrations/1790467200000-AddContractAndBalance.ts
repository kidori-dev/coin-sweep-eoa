import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 자산을 문자열이 아니라 행으로 만든다.
 *
 *  - contract            : 우리가 다루는 자산 한 건. 네이티브 TRX 도 address = NULL 인 행으로 들어간다.
 *  - user_wallet_balance : 지갑 × 자산 잔고. user_wallet.usdt_amount 를 대체한다.
 *  - transactions / scan_cursor / scan_run 의 contract varchar → contract_id FK
 *
 * 기존 contract 문자열은 transactions 가 들고 있던 token_symbol / token_decimals 스냅샷으로
 * 메타데이터를 복원해 행을 만든다. 이력에만 남고 메타를 알 수 없는 주소는 UNKNOWN 으로
 * 비활성 등록해 두고, 실제 값은 db:seed / tron:contract-add 가 체인에서 읽어 맞춘다.
 */
export class AddContractAndBalance1790467200000 implements MigrationInterface {
  name = 'AddContractAndBalance1790467200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "contract" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "chain" character varying(32) NOT NULL DEFAULT 'tron',
        "address" character varying(64),
        "symbol" character varying(32) NOT NULL,
        "decimals" integer NOT NULL,
        "is_native" boolean NOT NULL DEFAULT false,
        "is_active" boolean NOT NULL DEFAULT true,
        "is_default" boolean NOT NULL DEFAULT false,
        "min_sweep_amount" numeric(38,0) NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_contract_id" PRIMARY KEY ("id")
      )
    `);
    // NULLS NOT DISTINCT (PG15+): address 가 NULL 인 네이티브 행도 체인당 하나만 존재하게 막는다.
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_contract_address" ON "contract" ("chain", "address") NULLS NOT DISTINCT
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_contract_default" ON "contract" ("chain") WHERE "is_default"
    `);

    await queryRunner.query(`
      INSERT INTO "contract" ("chain", "address", "symbol", "decimals", "is_native")
      VALUES ('tron', NULL, 'TRX', 6, true)
    `);

    // 이력이 들고 있던 스냅샷에서 메타데이터를 복원한다. 같은 주소가 여러 번 나오면 최신 건을 쓴다.
    await queryRunner.query(`
      INSERT INTO "contract" ("chain", "address", "symbol", "decimals")
      SELECT DISTINCT ON (t."contract") 'tron', t."contract", t."token_symbol", t."token_decimals"
      FROM "transactions" t
      WHERE t."contract" IS NOT NULL
      ORDER BY t."contract", t."created_at" DESC
      ON CONFLICT DO NOTHING
    `);

    // 커서·실행이력에만 등장하는 주소는 메타를 알 수 없다. 눈에 띄게 비활성으로 넣어 둔다.
    for (const table of ['scan_cursor', 'scan_run']) {
      await queryRunner.query(`
        INSERT INTO "contract" ("chain", "address", "symbol", "decimals", "is_active")
        SELECT DISTINCT 'tron', s."contract", 'UNKNOWN', 6, false
        FROM "${table}" s
        WHERE s."contract" IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM "contract" c WHERE c."chain" = 'tron' AND c."address" = s."contract"
          )
        ON CONFLICT DO NOTHING
      `);
    }

    // 기본 자산은 입금 이력이 가장 많은 토큰으로 잡는다. 빈 DB 면 아무것도 안 잡히고 db:seed 가 지정한다.
    await queryRunner.query(`
      UPDATE "contract" SET "is_default" = true
      WHERE "id" = (
        SELECT c."id"
        FROM "contract" c
        LEFT JOIN "transactions" t ON t."contract" = c."address"
        WHERE c."is_native" = false
        GROUP BY c."id", c."created_at"
        ORDER BY COUNT(t."id") DESC, c."created_at" ASC
        LIMIT 1
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "user_wallet_balance" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_wallet_id" uuid NOT NULL,
        "contract_id" uuid NOT NULL,
        "amount" numeric(38,0) NOT NULL DEFAULT 0,
        "last_swept_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_wallet_balance_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_user_wallet_balance_user_wallet" FOREIGN KEY ("user_wallet_id")
          REFERENCES "user_wallet"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_user_wallet_balance_contract" FOREIGN KEY ("contract_id")
          REFERENCES "contract"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_user_wallet_balance" ON "user_wallet_balance"
        ("user_wallet_id", "contract_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_user_wallet_balance_contract_id" ON "user_wallet_balance" ("contract_id")
    `);

    await queryRunner.query(`
      INSERT INTO "user_wallet_balance" ("user_wallet_id", "contract_id", "amount", "last_swept_at")
      SELECT w."id", c."id", w."usdt_amount", w."last_swept_at"
      FROM "user_wallet" w
      CROSS JOIN "contract" c
      WHERE c."is_default" = true
        AND (w."usdt_amount" <> 0 OR w."last_swept_at" IS NOT NULL)
    `);

    await queryRunner.query(`ALTER TABLE "user_wallet" DROP COLUMN "usdt_amount"`);
    await queryRunner.query(`ALTER TABLE "user_wallet" DROP COLUMN "last_swept_at"`);

    // transactions: contract varchar → contract_id FK. NULL 은 네이티브 TRX 를 뜻했다.
    await queryRunner.query(`ALTER TABLE "transactions" ADD "contract_id" uuid`);
    await queryRunner.query(`
      UPDATE "transactions" t SET "contract_id" = c."id"
      FROM "contract" c
      WHERE c."chain" = 'tron'
        AND ((t."contract" IS NULL AND c."is_native") OR t."contract" = c."address")
    `);
    await queryRunner.query(`ALTER TABLE "transactions" ALTER COLUMN "contract_id" SET NOT NULL`);
    await queryRunner.query(`
      ALTER TABLE "transactions" ADD CONSTRAINT "FK_transactions_contract"
        FOREIGN KEY ("contract_id") REFERENCES "contract"("id") ON DELETE RESTRICT
    `);
    await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN "contract"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_transactions_contract_id" ON "transactions" ("contract_id")`,
    );

    // scan_cursor: 유니크 인덱스가 contract 를 물고 있어 먼저 떼고 새로 건다.
    await queryRunner.query(`DROP INDEX "UQ_scan_cursor_target"`);
    await queryRunner.query(`ALTER TABLE "scan_cursor" ADD "contract_id" uuid`);
    await queryRunner.query(`
      UPDATE "scan_cursor" s SET "contract_id" = c."id"
      FROM "contract" c
      WHERE c."chain" = 'tron'
        AND ((s."contract" IS NULL AND c."is_native") OR s."contract" = c."address")
    `);
    await queryRunner.query(`ALTER TABLE "scan_cursor" ALTER COLUMN "contract_id" SET NOT NULL`);
    await queryRunner.query(`
      ALTER TABLE "scan_cursor" ADD CONSTRAINT "FK_scan_cursor_contract"
        FOREIGN KEY ("contract_id") REFERENCES "contract"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`ALTER TABLE "scan_cursor" DROP COLUMN "contract"`);
    // contract_id 는 NOT NULL 이지만 user_wallet_id 는 전역 커서에서 NULL 이라 여전히 필요하다.
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_scan_cursor_target" ON "scan_cursor"
        ("scope", "user_wallet_id", "contract_id") NULLS NOT DISTINCT
    `);

    await queryRunner.query(`ALTER TABLE "scan_run" ADD "contract_id" uuid`);
    await queryRunner.query(`
      UPDATE "scan_run" s SET "contract_id" = c."id"
      FROM "contract" c
      WHERE c."chain" = 'tron'
        AND ((s."contract" IS NULL AND c."is_native") OR s."contract" = c."address")
    `);
    await queryRunner.query(`
      ALTER TABLE "scan_run" ADD CONSTRAINT "FK_scan_run_contract"
        FOREIGN KEY ("contract_id") REFERENCES "contract"("id") ON DELETE SET NULL
    `);
    await queryRunner.query(`ALTER TABLE "scan_run" DROP COLUMN "contract"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_scan_run_contract_id" ON "scan_run" ("contract_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_scan_run_contract_id"`);
    await queryRunner.query(`ALTER TABLE "scan_run" ADD "contract" character varying(64)`);
    await queryRunner.query(`
      UPDATE "scan_run" s SET "contract" = c."address"
      FROM "contract" c WHERE c."id" = s."contract_id"
    `);
    await queryRunner.query(`ALTER TABLE "scan_run" DROP CONSTRAINT "FK_scan_run_contract"`);
    await queryRunner.query(`ALTER TABLE "scan_run" DROP COLUMN "contract_id"`);

    await queryRunner.query(`DROP INDEX "UQ_scan_cursor_target"`);
    await queryRunner.query(`ALTER TABLE "scan_cursor" ADD "contract" character varying(64)`);
    await queryRunner.query(`
      UPDATE "scan_cursor" s SET "contract" = c."address"
      FROM "contract" c WHERE c."id" = s."contract_id"
    `);
    await queryRunner.query(`ALTER TABLE "scan_cursor" DROP CONSTRAINT "FK_scan_cursor_contract"`);
    await queryRunner.query(`ALTER TABLE "scan_cursor" DROP COLUMN "contract_id"`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_scan_cursor_target" ON "scan_cursor"
        ("scope", "user_wallet_id", "contract") NULLS NOT DISTINCT
    `);

    await queryRunner.query(`DROP INDEX "IDX_transactions_contract_id"`);
    await queryRunner.query(`ALTER TABLE "transactions" ADD "contract" character varying(64)`);
    await queryRunner.query(`
      UPDATE "transactions" t SET "contract" = c."address"
      FROM "contract" c WHERE c."id" = t."contract_id"
    `);
    await queryRunner.query(
      `ALTER TABLE "transactions" DROP CONSTRAINT "FK_transactions_contract"`,
    );
    await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN "contract_id"`);

    await queryRunner.query(`
      ALTER TABLE "user_wallet" ADD "usdt_amount" numeric(38,0) NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      ALTER TABLE "user_wallet" ADD "last_swept_at" TIMESTAMP WITH TIME ZONE
    `);
    await queryRunner.query(`
      UPDATE "user_wallet" w
      SET "usdt_amount" = b."amount", "last_swept_at" = b."last_swept_at"
      FROM "user_wallet_balance" b, "contract" c
      WHERE b."user_wallet_id" = w."id" AND b."contract_id" = c."id" AND c."is_default" = true
    `);

    await queryRunner.query(`DROP TABLE "user_wallet_balance"`);
    await queryRunner.query(`DROP TABLE "contract"`);
  }
}
