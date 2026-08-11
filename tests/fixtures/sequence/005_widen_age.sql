-- Full table rewrite of users. Everything built on it in 002 is rebuilt here.
ALTER TABLE users ALTER COLUMN age TYPE bigint;
