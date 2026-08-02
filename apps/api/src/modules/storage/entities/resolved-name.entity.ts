import { ApiProperty } from '@nestjs/swagger';

export class ResolvedNameEntity {
  @ApiProperty({ type: 'string', description: 'Opaque id that was resolved' })
  id: string;

  @ApiProperty({ type: 'string', description: 'Display name (empty when unresolvable)' })
  name: string;

  @ApiProperty({
    type: 'string',
    nullable: true,
    description: 'Link to open the item in its native backend (Drive web view); null when none',
  })
  webViewLink: string | null;
}
