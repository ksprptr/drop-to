// Lifetimes shared by the JWT `expiresIn` and the cookie `maxAge` so a token and
// its cookie always expire together.
export const ACCESS_TOKEN_TTL_SECONDS = 24 * 60 * 60; // 24 hours
export const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
