import type { ResumableUploadSession } from '@dropto/types';
import { ApiProperty } from '@nestjs/swagger';

/**
 * A resumable upload session; the browser PUTs bytes straight to `uploadUrl`, then calls finalize.
 **/
export class ResumableUploadSessionEntity implements ResumableUploadSession {
  @ApiProperty({ type: 'string', description: 'Session URL the browser streams the file bytes to' })
  uploadUrl: string;

  @ApiProperty({
    type: 'integer',
    description: 'How long the browser waits for a dropped connection before failing (ms)',
  })
  offlineTimeoutMs: number;
}
