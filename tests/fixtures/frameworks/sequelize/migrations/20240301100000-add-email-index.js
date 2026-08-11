'use strict';

module.exports = {
  up: async (queryInterface) => {
    await queryInterface.sequelize.query('CREATE INDEX idx_users_email ON users (email)');
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.query('DROP INDEX idx_users_email');
  },
};
