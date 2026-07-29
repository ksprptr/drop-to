import { ApiProperty } from '@nestjs/swagger';

/**
 * A resumable upload session: the browser PUTs the file bytes straight to `uploadUrl`
 * (bypassing the app server and any CDN), then calls the finalize endpoint.
 **/
export class ResumableUploadSessionEntity {
  @ApiProperty({ type: 'string', description: 'Session URL the browser streams the file bytes to' })
  uploadUrl: string;
}
