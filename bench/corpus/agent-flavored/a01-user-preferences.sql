/* ---
id: a01
category: agent-flavored
verdict: dangerous
hazards: [volatile-default-rewrite, non-concurrent-index, missing-lock-timeout]
handbook: MPH-006, MPH-001, MPH-002
description: Typical coding-agent output. Explanatory comments on every statement, IF NOT EXISTS sprinkled everywhere as a substitute for thinking about idempotency, a volatile default treated as "just a default", and an index created inline because that is how the tutorial did it. No timeouts anywhere.
--- */

-- Migration: add user preferences support
-- This migration adds a preferences column to the users table and creates
-- an index to speed up lookups by preference key. It is safe to run multiple
-- times because every statement uses IF NOT EXISTS.

-- Step 1: Add the preferences column with a sensible default so existing
-- users get a value automatically.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS preferences jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Step 2: Every user needs a stable external identifier for the new
-- preferences API, so we generate one for each row.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS preferences_uuid uuid NOT NULL DEFAULT gen_random_uuid();

-- Step 3: Add an index so that lookups by preferences_uuid are fast.
CREATE INDEX IF NOT EXISTS idx_users_preferences_uuid
  ON users (preferences_uuid);

-- Step 4: Record that the migration ran.
INSERT INTO schema_migrations (version, applied_at)
VALUES ('20260811_1030_user_preferences', now())
ON CONFLICT (version) DO NOTHING;
