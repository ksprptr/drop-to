import { registerAs } from '@nestjs/config';

export const uploadConfig = registerAs('upload', () => ({
  maxUploadBytes: parseInt(process.env['MAX_UPLOAD_BYTES']!),
  offlineTimeoutMs: parseInt(process.env['OFFLINE_TIMEOUT_MS']!),
}));

export type UploadConfig = ReturnType<typeof uploadConfig>;
