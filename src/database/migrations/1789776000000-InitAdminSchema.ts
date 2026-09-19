import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitAdminSchema1789776000000 implements MigrationInterface {
  name = 'InitAdminSchema1789776000000';

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
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_admins_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_admins_email" ON "admins" ("email")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "UQ_admins_email"`);
    await queryRunner.query(`DROP TABLE "admins"`);
    await queryRunner.query(`DROP TYPE "admins_role_enum"`);
  }
}
