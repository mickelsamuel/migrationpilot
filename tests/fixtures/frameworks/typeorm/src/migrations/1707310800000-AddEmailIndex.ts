import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEmailIndex1707310800000 implements MigrationInterface {
  name = 'AddEmailIndex1707310800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE INDEX "idx_users_email" ON "users" ("email")');
    await queryRunner.query('ALTER TABLE "users" ALTER COLUMN "email" SET NOT NULL');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX "idx_users_email"');
    await queryRunner.query('DROP TABLE "users"');
  }
}
