// Access JWT lifetime — short-lived; the web client refreshes it via the refresh cookie before it expires.
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
// Access cookie lifetime — a longer-lived container; the JWT inside expires sooner and is refreshed.
export const ACCESS_COOKIE_MAX_AGE_SECONDS = 24 * 60 * 60;
// Refresh cookie `maxAge` / sliding idle lifetime — every use rotates and restarts this window.
export const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;
// Absolute session cap — a session can never live past `login + this`; forces a periodic re-login.
export const REFRESH_ABSOLUTE_TTL_SECONDS = 30 * 24 * 60 * 60;
// Grace window in which replaying a just-rotated token reads as a concurrent refresh, not as theft.
// Clients collapse parallel refreshes in memory, which does not hold across replicas or a restart,
// so two requests can legitimately present the same token seconds apart. Keep it short: inside it a
// genuinely stolen token would still be honoured once.
export const REFRESH_REUSE_GRACE_SECONDS = 15;
