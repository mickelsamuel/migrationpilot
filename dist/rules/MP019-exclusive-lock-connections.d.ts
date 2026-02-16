/**
 * MP019: no-exclusive-lock-high-connections
 *
 * Taking an ACCESS EXCLUSIVE lock when the table has many active connections
 * means those connections will queue up waiting, causing cascading timeouts
 * across the application. This is a production-context rule (paid tier).
 *
 * Safe alternative: Run during low-traffic windows, set a short lock_timeout,
 * and retry with exponential backoff.
 */
import type { Rule } from './engine.js';
export declare const noExclusiveLockHighConnections: Rule;
//# sourceMappingURL=MP019-exclusive-lock-connections.d.ts.map