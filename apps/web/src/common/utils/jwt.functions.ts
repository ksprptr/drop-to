interface JwtPayload {
  sub?: string;
  exp?: number;
  iat?: number;
  [key: string]: unknown;
}

/**
 * Decodes a JWT payload WITHOUT verifying its signature.
 *
 * Used by proxy.ts only to read the `exp` claim for a proactive-refresh decision —
 * the API still verifies the signature on every request, so no secret is needed
 * (and must not live in the app).
 * @param token - The raw JWT
 * @returns The decoded payload, or null when the token is missing or malformed
 */
export const decodeJwtPayload = (token: string | undefined): JwtPayload | null => {
  if (!token) {
    return null;
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as JwtPayload;
  } catch {
    return null;
  }
};

/**
 * Determines whether an access token is still usable, i.e. present and not about to
 * expire. Refresh triggers only in the tail of the token's life (the smaller of
 * `maxSkewMs` or 20 % of its lifetime) so a short-lived token isn't treated as
 * always-expiring.
 * @param token - The raw access-token JWT
 * @param maxSkewMs - Upper bound on the proactive-refresh window before expiry
 * @returns True when the token can still be trusted (not yet in its refresh window)
 */
export const isAccessTokenFresh = (token: string | undefined, maxSkewMs: number): boolean => {
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) {
    return false;
  }

  const expMs = payload.exp * 1000;
  const lifetimeMs = payload.iat ? expMs - payload.iat * 1000 : maxSkewMs;
  const skewMs = Math.min(maxSkewMs, lifetimeMs * 0.2);

  return expMs > Date.now() + skewMs;
};
