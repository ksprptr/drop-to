/**
 * Internal token pair (written into httpOnly cookies by the controller).
 **/
export class AuthResponseEntity {
  accessToken: string;
  refreshToken: string;
}
