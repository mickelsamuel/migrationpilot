module.exports = {
  client: 'pg',
  connection: process.env.DATABASE_URL,
  migrations: {
    directory: './db/migrations',
    tableName: 'knex_migrations',
  },
};
