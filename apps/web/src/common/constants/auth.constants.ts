// Cookie names must match what the API sets/reads.
export const ACCESS_TOKEN_COOKIE = 'accessToken';
export const REFRESH_TOKEN_COOKIE = 'refreshToken';
export const REFRESH_LOCK_COOKIE = 'refresh_lock';

/** Refresh proactively when the access token expires within this window. */
export const ACCESS_EXP_SKEW_MS = 60_000;

/** refresh_lock lifetime — self-heals a crashed refresh. */
export const REFRESH_LOCK_MAX_AGE_S = 8;

export const REFRESH_WAIT_INTERVAL_MS = 100;
export const REFRESH_WAIT_MAX_ATTEMPTS = 20;

/** How long a completed refresh stays memoised (keyed by the old refresh token). */
export const REFRESH_MEMO_TTL_MS = 10_000;
