import type { AuthUser } from '@dropto/types';
import { ApiProperty } from '@nestjs/swagger';

export class AuthUserEntity implements AuthUser {
  @ApiProperty({ type: 'boolean', description: 'Whether the request carries a valid session' })
  authenticated: boolean;
}
