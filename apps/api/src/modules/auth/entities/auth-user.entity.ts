import { ApiProperty } from '@nestjs/swagger';

export class AuthUserEntity {
  @ApiProperty({ type: 'string', description: 'Username of the authenticated operator' })
  username: string;
}
