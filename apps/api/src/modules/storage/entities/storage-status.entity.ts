import type { StorageRoot, StorageStatus } from '@dropto/types';
import { ApiProperty } from '@nestjs/swagger';

import { StorageBackend } from '../interfaces/storage-provider.interface';

/**
 * A browse root within a backend: a Drive folder or an S3 bucket.
 **/
export class StorageRootEntity implements StorageRoot {
  @ApiProperty({ type: 'string', description: 'Opaque id used to browse into this root' })
  id: string;

  @ApiProperty({ type: 'string', description: 'Display name (folder name / bucket name)' })
  name: string;
}

export class StorageStatusEntity implements StorageStatus {
  @ApiProperty({ enum: ['drive', 's3'], description: 'Storage backend key' })
  backend: StorageBackend;

  @ApiProperty({ type: 'string', description: 'Human-readable backend name' })
  label: string;

  @ApiProperty({ type: 'boolean', description: 'Whether the backend is usable' })
  connected: boolean;

  @ApiProperty({ type: [StorageRootEntity], description: 'Browse roots (folders / buckets)' })
  roots: StorageRootEntity[];

  @ApiProperty({
    type: 'string',
    nullable: true,
    required: false,
    description: 'Connected account email (Drive only)',
  })
  email?: string | null;

  @ApiProperty({
    type: 'string',
    nullable: true,
    required: false,
    description: 'Why a configured backend is unusable (revoked token / unreachable bucket)',
  })
  error?: string | null;

  @ApiProperty({
    type: 'boolean',
    required: false,
    description:
      'Whether the caller is the verified Drive owner (may manage/disconnect). Drive only.',
  })
  isOwner?: boolean;

  @ApiProperty({
    required: false,
    nullable: true,
    description: 'Storage usage of the connected account (Drive only), in bytes',
    example: { usage: 123456789, limit: 5497558138880 },
  })
  quota?: { usage: number; limit: number | null } | null;
}
