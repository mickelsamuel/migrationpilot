import { MigrationInterface, QueryRunner } from 'typeorm';

const TENANTS = ['acme', 'globex'];

export class BackfillTenants1710000000000 implements MigrationInterface {
  name = 'BackfillTenants1710000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const tenant of TENANTS) {
      await queryRunner.query(`ALTER TABLE "${tenant}_users" ADD COLUMN "tier" text`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const tenant of TENANTS) {
      await queryRunner.query(`ALTER TABLE "${tenant}_users" DROP COLUMN "tier"`);
    }
  }
}
