/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function up(knex) {
  await knex.raw(`CREATE INDEX idx_users_email ON users (email)`);
  await knex.raw('ALTER TABLE users ALTER COLUMN email SET NOT NULL');
};

exports.down = async function down(knex) {
  await knex.raw('DROP INDEX idx_users_email');
};
