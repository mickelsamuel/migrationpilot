/* ---
id: c01
category: context
verdict: context-dependent
hazards: [non-concurrent-index]
handbook: MPH-001
safe_at: small
description: Structurally identical to u01. On the 40-row country_codes lookup table the SHARE lock is held for microseconds and nobody notices; on a 400M-row table the same statement is an outage. No static analyser can tell these apart without table size, so a flag here is defensible behaviour, not an error.
--- */

SET lock_timeout = '2s';

-- country_codes: 249 rows, written once a year when ISO publishes an update.
CREATE INDEX idx_country_codes_alpha3 ON country_codes (alpha3);
