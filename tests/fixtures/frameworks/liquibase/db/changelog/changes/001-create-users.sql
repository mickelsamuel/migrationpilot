--liquibase formatted sql

--changeset dev:001-create-users
CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    email TEXT NOT NULL
);
--rollback DROP TABLE users;
