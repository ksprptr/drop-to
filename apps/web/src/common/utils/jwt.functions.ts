interface JwtPayload {
  sub?: string;
  exp?: number;
  iat?: number;
  [key: string]: unknown;
}

/**
 * Decodes a JWT payload WITHOUT verifying its signature (proxy reads `exp` only).
 **/
const decodeJwtPayload = (token: string | undefined): JwtPayload | null => {
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
 * Whether the access token is present and not about to expire (refreshes in the tail of its lifetime).
 **/
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
