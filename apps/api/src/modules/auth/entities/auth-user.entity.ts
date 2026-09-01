import type { AuthUser } from '@dropto/types';
import { ApiProperty } from '@nestjs/swagger';

export class AuthUserEntity implements AuthUser {
  @ApiProperty({ type: 'string', description: 'Username of the authenticated operator' })
  username: string;
}
