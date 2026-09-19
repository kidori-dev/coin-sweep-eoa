import { MigrationInterface, QueryRunner } from 'typeorm';

export class MergeSweepLogs1790294400000 implements MigrationInterface {
  name = 'MergeSweepLogs1790294400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "sweep_logs"`);
    await queryRunner.query(`DROP TYPE "sweep_logs_status_enum"`);
    await queryRunner.query(`DROP TYPE "sweep_logs_asset_enum"`);

    await queryRunner.query(
      `CREATE TYPE "transactions_status_enum" AS ENUM('success', 'failed', 'skipped')`,
    );
    await queryRunner.query(`
      ALTER TABLE "transactions"
      ADD "status" "transactions_status_enum" NOT NULL DEFAULT 'success'
    `);
    await queryRunner.query(`ALTER TABLE "transactions" ADD "address" character varying(64)`);
    await queryRunner.query(`UPDATE "transactions" SET "address" = "to_address"`);
    await queryRunner.query(`ALTER TABLE "transactions" ALTER COLUMN "address" SET NOT NULL`);

    await queryRunner.query(`ALTER TABLE "transactions" ADD "fee_strategy" character varying(16)`);
    await queryRunner.query(`ALTER TABLE "transactions" ADD "fee_txid" character varying(64)`);
    await queryRunner.query(`ALTER TABLE "transactions" ADD "error" text`);

    await queryRunner.query(`ALTER TABLE "transactions" ALTER COLUMN "contract" DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE "transactions" ALTER COLUMN "txid" DROP NOT NULL`);
    await queryRunner.query(
      `ALTER TABLE "transactions" ALTER COLUMN "block_timestamp" DROP NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN "error"`);
    await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN "fee_txid"`);
    await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN "fee_strategy"`);
    await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN "address"`);
    await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN "status"`);
    await queryRunner.query(`DROP TYPE "transactions_status_enum"`);

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
        CONSTRAINT "PK_sweep_logs_id" PRIMARY KEY ("id")
      )
    `);
  }
}
