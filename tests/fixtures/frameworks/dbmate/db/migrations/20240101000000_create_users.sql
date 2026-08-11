-- migrate:up
CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    email TEXT NOT NULL
);

-- migrate:down
DROP TABLE users;
