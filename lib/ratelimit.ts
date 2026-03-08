/**
 * lib/ratelimit.ts
 * ─────────────────────────────────────────────────────────────────
 * Persistent rate limiting backed by Upstash Redis.
 *
 * Why Upstash instead of the old in-memory Map?
 *   Vercel serverless functions spin up a fresh Node process per cold
 *   start. A module-level Map is reset on every cold start, so the
 *   old limiter gave zero real protection. Upstash Redis is shared
 *   across all Vercel instances and persists between invocations.
 *
 * Setup (one-time):
 *   1. Create a free database at console.upstash.com
 *   2. Copy REST URL + REST Token into Vercel env vars:
 *        UPSTASH_REDIS_REST_URL=...
 *        UPSTASH_REDIS_REST_TOKEN=...
 *
 * Dev fallback:
 *   If the env vars are absent (local dev without Redis), all limits
 *   are bypassed with a console warning — the app still runs.
 * ─────────────────────────────────────────────────────────────────
 */

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

type LimitResult = { success: boolean; limit: number; remaining: number; reset: number };

interface Limiter {
  limit(key: string): Promise<LimitResult>;
}

/** No-op limiter used when Upstash env vars are missing (dev mode) */
const noopLimiter = (requests: number): Limiter => ({
  async limit() {
    console.warn('[ratelimit] Upstash env vars not set — rate limiting is disabled. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in Vercel.');
    return { success: true, limit: requests, remaining: requests, reset: 0 };
  },
});

function createLimiter(
  requests: number,
  window: `${number} ${'s' | 'm' | 'h'}`,
): Limiter {
  if (
    !process.env.UPSTASH_REDIS_REST_URL ||
    !process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    return noopLimiter(requests);
  }

  return new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(requests, window),
    analytics: false,
    prefix: 'rhl',   // rehoboth limiter namespace
  });
}

/**
 * 5 attempts per minute — used by /api/verify and /api/master
 * Sliding window so bursts are smoothed out.
 */
export const verifyLimiter = createLimiter(5, '1 m');

/**
 * 5 attempts per 15 minutes — used by /api/admin/login
 * Tighter window because admin credentials are higher value targets.
 */
export const loginLimiter = createLimiter(5, '15 m');
