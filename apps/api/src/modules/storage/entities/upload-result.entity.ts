import type { UploadResult } from '@dropto/types';
import { ApiProperty } from '@nestjs/swagger';

export class UploadResultEntity implements UploadResult {
  @ApiProperty({
    type: 'string',
    description: 'Opaque id of the uploaded file (Drive id or S3 ref)',
  })
  fileId: string;

  @ApiProperty({ type: 'string', description: 'Uploaded file name' })
  fileName: string;

  @ApiProperty({ type: 'number', nullable: true, description: 'Size in bytes' })
  size: number | null;

  @ApiProperty({ type: 'string', nullable: true, description: 'Web view URL' })
  webViewLink: string | null;
}
