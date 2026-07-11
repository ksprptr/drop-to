export interface RequestUser {
  sub: string;
}

export interface JwtRequestUser extends RequestUser {
  iat: number;
  exp: number;
}
