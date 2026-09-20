import type { PublicLink } from '@dropto/types';
import { ApiProperty } from '@nestjs/swagger';

export class PublicLinkEntity implements PublicLink {
  @ApiProperty({ type: 'string', description: 'Bearer secret identifying the link' })
  token: string;

  @ApiProperty({ type: 'string', description: 'Full shareable URL (resolved by the web app)' })
  url: string;

  @ApiProperty({ type: 'string', description: 'Name of the linked file' })
  fileName: string;

  @ApiProperty({ type: 'string', description: 'ISO creation timestamp' })
  createdAt: string;
}
