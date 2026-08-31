import type { AllowedFolder } from '@dropto/types';
import { ApiProperty } from '@nestjs/swagger';

export class AllowedFolderEntity implements AllowedFolder {
  @ApiProperty({ type: 'string', description: 'Internal record id' })
  id: string;

  @ApiProperty({ type: 'string', description: 'Google Drive folder id' })
  folderId: string;

  @ApiProperty({ type: 'string', description: 'Cached folder name' })
  name: string;

  @ApiProperty({
    type: 'string',
    format: 'date-time',
    description: 'When the folder was authorized',
  })
  createdAt: string;
}

/**
 * Maps a Prisma allowed-folder row onto the wire entity (Date → ISO string).
 **/
export function toAllowedFolderEntity(row: {
  id: string;
  folderId: string;
  name: string;
  createdAt: Date;
}): AllowedFolderEntity {
  return {
    id: row.id,
    folderId: row.folderId,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
  };
}
