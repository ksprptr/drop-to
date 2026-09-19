// Cookie names must match what the API sets/reads.
export const ACCESS_TOKEN_COOKIE = 'accessToken';
export const REFRESH_TOKEN_COOKIE = 'refreshToken';
export const REFRESH_LOCK_COOKIE = 'refresh_lock';
export const DRIVE_OWNER_COOKIE = 'driveOwner';
export const OAUTH_STATE_COOKIE = 'oauthState';

/** Marks the login page as reached from a session the API turned out to reject. */
export const SESSION_EXPIRED_REASON = 'session-expired';

/* Forces the proxy to refresh even though the access token's `exp` still looks fine. */
export const REAUTH_PARAM = '__reauth';

/** One-shot guard so a re-auth that does not stick ends the session instead of looping. */
export const REAUTH_GUARD_COOKIE = 'reauthGuard';
export const REAUTH_GUARD_MAX_AGE_S = 10;

/** The proxy stamps the request's path+query here so a render can redirect back to itself. */
export const REQUEST_URL_HEADER = 'x-dropto-url';

/** How long the Drive owner-proof stays valid in the browser. */
export const DRIVE_OWNER_MAX_AGE_S = 30 * 24 * 60 * 60;

/** Refresh proactively when the access token expires within this window. */
export const ACCESS_EXP_SKEW_MS = 60_000;

/** refresh_lock lifetime — self-heals a crashed refresh. */
export const REFRESH_LOCK_MAX_AGE_S = 8;

export const REFRESH_WAIT_INTERVAL_MS = 100;
export const REFRESH_WAIT_MAX_ATTEMPTS = 20;

/** How long a completed refresh stays memoised (keyed by the old refresh token). */
export const REFRESH_MEMO_TTL_MS = 10_000;
