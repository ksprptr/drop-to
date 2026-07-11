import { ApiProperty } from '@nestjs/swagger';

/**
 * Class representing an allowed folder entity
 */
export class AllowedFolderEntity {
  @ApiProperty({ type: 'string', description: 'Internal record id' })
  id: string;

  @ApiProperty({ type: 'string', description: 'Google Drive folder id' })
  folderId: string;

  @ApiProperty({ type: 'string', description: 'Cached folder name' })
  name: string;

  @ApiProperty({ type: 'string', format: 'date-time', description: 'When the folder was authorized' })
  createdAt: Date;
}
