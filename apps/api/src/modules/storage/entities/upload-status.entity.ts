import type { ResumableUploadStatus } from '@dropto/types';
import { ApiProperty } from '@nestjs/swagger';

/**
 * How far a resumable upload session got — lets the browser resume a dropped upload from where it left off
 **/
export class UploadStatusEntity implements ResumableUploadStatus {
  @ApiProperty({ type: 'boolean', description: 'Whether the upload already finished' })
  complete: boolean;

  @ApiProperty({ type: 'integer', description: 'Bytes the session has confirmed received' })
  receivedBytes: number;

  @ApiProperty({
    type: 'string',
    nullable: true,
    description: 'The stored file id (only when complete)',
  })
  fileId: string | null;
}
