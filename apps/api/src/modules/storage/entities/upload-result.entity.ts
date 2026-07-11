import { ApiProperty } from '@nestjs/swagger';

/**
 * Class representing an upload result entity
 */
export class UploadResultEntity {
  @ApiProperty({ type: 'string', description: 'Google Drive file id of the uploaded file' })
  fileId: string;

  @ApiProperty({ type: 'string', description: 'Uploaded file name' })
  fileName: string;

  @ApiProperty({ type: 'number', nullable: true, description: 'Size in bytes' })
  size: number | null;

  @ApiProperty({ type: 'string', nullable: true, description: 'Web view URL' })
  webViewLink: string | null;
}
