-- Baseline schema for the sequence fixtures.
CREATE TABLE users (
    id bigserial PRIMARY KEY,
    email text NOT NULL,
    age integer,
    legacy_notes text
);
