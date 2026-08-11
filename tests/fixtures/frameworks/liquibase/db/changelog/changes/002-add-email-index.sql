--liquibase formatted sql

--changeset dev:002-add-email-index runInTransaction:false
CREATE INDEX idx_users_email ON users (email);
--rollback DROP INDEX idx_users_email;
