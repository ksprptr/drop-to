/**
 * Internal token pair returned by the auth service (never serialized directly —
 * the controller writes the tokens into httpOnly cookies).
 */
export class AuthResponseEntity {
  accessToken: string;
  refreshToken: string;
}
