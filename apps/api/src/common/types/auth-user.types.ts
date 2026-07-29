export interface RequestUser {
  sub: string;
}

/** Access-token payload: the operator plus the token version used for server-side revocation. */
export interface AccessTokenPayload extends RequestUser {
  ver: number;
}

/** Verified access-token claims (AuthGuard). */
export interface JwtRequestUser extends AccessTokenPayload {
  iat: number;
  exp: number;
}
