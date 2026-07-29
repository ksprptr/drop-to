import { registerAs } from '@nestjs/config';

// S3 backend. `enabled` is a kill-switch; the rest is validated only when enabled.
export const s3Config = registerAs('s3', () => {
  const enabled = process.env['S3_ENABLED'] === 'true';

  const buckets = (process.env['S3_BUCKETS'] ?? '')
    .split(',')
    .map((bucket) => bucket.trim())
    .filter(Boolean);

  if (enabled) {
    const missing = ['S3_REGION', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'].filter(
      (key) => !process.env[key],
    );
    if (missing.length > 0) {
      throw new Error(`S3 is enabled but missing required variables: ${missing.join(', ')}`);
    }
    if (buckets.length === 0) {
      throw new Error('S3 is enabled but S3_BUCKETS is empty (comma-separated bucket names).');
    }
  }

  return {
    enabled,
    buckets,
    region: process.env['S3_REGION']!,
    accessKeyId: process.env['S3_ACCESS_KEY_ID']!,
    secretAccessKey: process.env['S3_SECRET_ACCESS_KEY']!,
    // Optional — only set for S3-compatible backends (MinIO, R2, ...).
    endpoint: process.env['S3_ENDPOINT'] || undefined,
    forcePathStyle: process.env['S3_FORCE_PATH_STYLE'] === 'true',
  };
});

export type S3Config = ReturnType<typeof s3Config>;
