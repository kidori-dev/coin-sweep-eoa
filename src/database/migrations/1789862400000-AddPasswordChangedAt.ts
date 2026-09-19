import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPasswordChangedAt1789862400000 implements MigrationInterface {
  name = 'AddPasswordChangedAt1789862400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "admins"
      ADD "password_changed_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "admins" DROP COLUMN "password_changed_at"`);
  }
}
