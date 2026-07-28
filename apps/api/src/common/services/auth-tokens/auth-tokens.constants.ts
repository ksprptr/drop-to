// Access JWT lifetime — short-lived so a stolen access token is only usable briefly; the web
// client silently refreshes it via the refresh cookie well before it expires.
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
// Access cookie lifetime — a longer-lived container. The JWT inside expires far sooner and is
// rotated by the proactive refresh, so the cookie itself needn't vanish between refreshes.
export const ACCESS_COOKIE_MAX_AGE_SECONDS = 24 * 60 * 60;
// Shared by the refresh JWT `expiresIn` and its cookie `maxAge`.
export const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;
