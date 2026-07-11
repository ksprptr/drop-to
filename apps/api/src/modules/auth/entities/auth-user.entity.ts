import { ApiProperty } from '@nestjs/swagger';

/**
 * Class representing the authenticated operator returned by `GET /auth/me`.
 */
export class AuthUserEntity {
  @ApiProperty({ type: 'string', description: 'Username of the authenticated operator' })
  username: string;
}
