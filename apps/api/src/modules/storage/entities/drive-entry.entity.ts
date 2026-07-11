import { ApiProperty } from '@nestjs/swagger';

/**
 * Class representing a drive entry entity (a file or folder inside a folder)
 */
export class DriveEntryEntity {
  @ApiProperty({ type: 'string', description: 'Google Drive file/folder id' })
  id: string;

  @ApiProperty({ type: 'string', description: 'Name' })
  name: string;

  @ApiProperty({ type: 'string', description: 'MIME type' })
  mimeType: string;

  @ApiProperty({ type: 'boolean', description: 'Whether the entry is a folder' })
  isFolder: boolean;

  @ApiProperty({ type: 'number', nullable: true, description: 'Size in bytes (null for folders)' })
  size: number | null;

  @ApiProperty({ type: 'string', nullable: true, format: 'date-time', description: 'Last modified' })
  modifiedTime: string | null;

  @ApiProperty({ type: 'string', nullable: true, description: 'Icon URL' })
  iconLink: string | null;

  @ApiProperty({ type: 'string', nullable: true, description: 'Web view URL' })
  webViewLink: string | null;
}
