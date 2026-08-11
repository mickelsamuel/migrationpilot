/* ---
id: c05
category: context
verdict: context-dependent
hazards: [drop-column]
handbook: MPH-013
safe_at: unreferenced
description: Dropping a column added by a migration that shipped this morning and was never read by application code. Both handbook mechanisms need something to break: no cached plan selects it and no view depends on it. The tool cannot know that, so a flag here is honest conservatism.
--- */

SET lock_timeout = '2s';

-- Added in 20260810_1420, never referenced by application code, reverted before release.
ALTER TABLE users DROP COLUMN experiment_bucket;
