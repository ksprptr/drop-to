export interface RequestUser {
  sub: string;
}

/** JWT payload: the operator plus the token version used for server-side revocation. */
export interface TokenPayload extends RequestUser {
  ver: number;
}

export interface JwtRequestUser extends TokenPayload {
  iat: number;
  exp: number;
}
