SET statement_timeout = 0;

CREATE TABLE public.users (
    id bigint NOT NULL,
    email character varying NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);

INSERT INTO "schema_migrations" (version) VALUES ('20240101000000');
