import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateSessions1712000000000 implements MigrationInterface {
  name = 'CreateSessions1712000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'sessions',
        columns: [
          { name: 'id', type: 'int', isPrimary: true },
          { name: 'user_id', type: 'int' },
        ],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('sessions');
  }
}
