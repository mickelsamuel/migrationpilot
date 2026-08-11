exports.up = function up(knex) {
  return knex.schema.createTable('orders', table => {
    table.increments('id');
    table.integer('user_id').notNullable();
    table.integer('total_cents').notNullable();
  });
};

exports.down = function down(knex) {
  return knex.schema.dropTable('orders');
};
