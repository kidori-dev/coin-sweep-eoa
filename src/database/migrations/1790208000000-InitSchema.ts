import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitSchema1790208000000 implements MigrationInterface {
  name = 'InitSchema1790208000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);

    await queryRunner.query(`CREATE TYPE "admins_role_enum" AS ENUM('super_admin', 'admin')`);
    await queryRunner.query(`
      CREATE TABLE "admins" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "email" character varying(255) NOT NULL,
        "password_hash" character varying(255) NOT NULL,
        "name" character varying(100),
        "role" "admins_role_enum" NOT NULL DEFAULT 'admin',
        "is_active" boolean NOT NULL DEFAULT true,
        "last_login_at" TIMESTAMP WITH TIME ZONE,
        "password_changed_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_admins_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_admins_email" ON "admins" ("email")`);

    await queryRunner.query(`
      CREATE TABLE "user_wallet" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "address" character varying(64) NOT NULL,
        "derivation_index" integer NOT NULL,
        "user_ref" character varying(128),
        "is_active" boolean NOT NULL DEFAULT true,
        "usdt_amount" numeric(38,0) NOT NULL DEFAULT 0,
        "last_swept_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_wallet_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_user_wallet_address" ON "user_wallet" ("address")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_user_wallet_index" ON "user_wallet" ("derivation_index")`,
    );

    await queryRunner.query(`CREATE TYPE "transactions_type_enum" AS ENUM('deposit', 'sweep')`);
    await queryRunner.query(`
      CREATE TABLE "transactions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_wallet_id" uuid NOT NULL,
        "type" "transactions_type_enum" NOT NULL,
        "contract" character varying(64) NOT NULL,
        "token_symbol" character varying(32) NOT NULL,
        "token_decimals" integer NOT NULL,
        "txid" character varying(64) NOT NULL,
        "from_address" character varying(64) NOT NULL,
        "to_address" character varying(64) NOT NULL,
        "amount" numeric(38,0) NOT NULL,
        "block_timestamp" TIMESTAMP WITH TIME ZONE NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_transactions_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_transactions_user_wallet" FOREIGN KEY ("user_wallet_id")
          REFERENCES "user_wallet"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_transactions_tx" ON "transactions" ("txid", "user_wallet_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_transactions_user_wallet_id" ON "transactions" ("user_wallet_id")`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_transactions_txid" ON "transactions" ("txid")`);

    await queryRunner.query(`CREATE TYPE "sweep_logs_asset_enum" AS ENUM('TRX', 'TOKEN')`);
    await queryRunner.query(
      `CREATE TYPE "sweep_logs_status_enum" AS ENUM('success', 'failed', 'skipped')`,
    );
    await queryRunner.query(`
      CREATE TABLE "sweep_logs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_wallet_id" uuid NOT NULL,
        "address" character varying(64) NOT NULL,
        "asset" "sweep_logs_asset_enum" NOT NULL,
        "contract" character varying(64),
        "amount" numeric(38,0) NOT NULL,
        "status" "sweep_logs_status_enum" NOT NULL,
        "txid" character varying(64),
        "fee_strategy" character varying(16),
        "fee_txid" character varying(64),
        "error" text,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_sweep_logs_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_sweep_logs_user_wallet" FOREIGN KEY ("user_wallet_id")
          REFERENCES "user_wallet"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_sweep_logs_user_wallet_id" ON "sweep_logs" ("user_wallet_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "sweep_logs"`);
    await queryRunner.query(`DROP TYPE "sweep_logs_status_enum"`);
    await queryRunner.query(`DROP TYPE "sweep_logs_asset_enum"`);
    await queryRunner.query(`DROP TABLE "transactions"`);
    await queryRunner.query(`DROP TYPE "transactions_type_enum"`);
    await queryRunner.query(`DROP TABLE "user_wallet"`);
    await queryRunner.query(`DROP TABLE "admins"`);
    await queryRunner.query(`DROP TYPE "admins_role_enum"`);
  }
}
