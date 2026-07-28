export interface RequestUser {
  sub: string;
}

/** Access-token payload: the operator plus the token version used for server-side revocation. */
export interface AccessTokenPayload extends RequestUser {
  ver: number;
}

/** Refresh-token payload: adds `jti`, the id of the backing `RefreshToken` row (rotation/reuse). */
export interface RefreshTokenPayload extends AccessTokenPayload {
  jti: string;
}

/** Verified access-token claims (AuthGuard). */
export interface JwtRequestUser extends AccessTokenPayload {
  iat: number;
  exp: number;
}

/** Verified refresh-token claims. */
export interface RefreshJwtPayload extends RefreshTokenPayload {
  iat: number;
  exp: number;
}
