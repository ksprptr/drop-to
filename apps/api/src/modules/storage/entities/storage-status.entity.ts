import { ApiProperty } from '@nestjs/swagger';

import { StorageBackend } from '../interfaces/storage-provider.interface';

/**
 * Class representing a storage root entity (a browse root within a backend:
 * an authorized folder for Drive, a configured bucket for S3).
 */
export class StorageRootEntity {
  @ApiProperty({ type: 'string', description: 'Opaque id used to browse into this root' })
  id: string;

  @ApiProperty({ type: 'string', description: 'Display name (folder name / bucket name)' })
  name: string;
}

/**
 * Class representing a storage backend status entity, used to render the sidebar
 * and the storage switcher.
 */
export class StorageStatusEntity {
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
}
