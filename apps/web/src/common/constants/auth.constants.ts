/**
 * Auth-related cookie names and refresh-flow tuning shared by proxy.ts and the API
 * client. The token cookie names must match what the API sets/reads (see the
 * apps/api auth-tokens helper).
 */

/** httpOnly JWT access token cookie (API: 24 h). */
export const ACCESS_TOKEN_COOKIE = 'accessToken';

/** httpOnly JWT refresh token cookie (API: 7 d). */
export const REFRESH_TOKEN_COOKIE = 'refreshToken';

/** Short-lived cookie signalling a refresh is in progress (self-heals via maxAge). */
export const REFRESH_LOCK_COOKIE = 'refresh_lock';

/**
 * Refresh the access token proactively when it expires within this window, so a
 * request never races the expiry boundary and hits a 401 mid-render.
 */
export const ACCESS_EXP_SKEW_MS = 60_000;

/**
 * `refresh_lock` cookie lifetime. If the proxy crashes mid-refresh the lock
 * auto-expires after this, so a later request retries instead of wedging the user.
 */
export const REFRESH_LOCK_MAX_AGE_S = 8;

/** Concurrent request waiting on an in-flight refresh: poll cadence and ceiling. */
export const REFRESH_WAIT_INTERVAL_MS = 100;
export const REFRESH_WAIT_MAX_ATTEMPTS = 20;

/**
 * How long a completed refresh keeps its result memoised, keyed by the OLD refresh
 * token, so stragglers still carrying the old cookie reuse it instead of
 * re-refreshing.
 */
export const REFRESH_MEMO_TTL_MS = 10_000;
