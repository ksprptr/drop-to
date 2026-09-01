import type { DriveEntryPage } from '@dropto/types';
import { ApiProperty } from '@nestjs/swagger';

import { DriveEntryEntity } from './drive-entry.entity';

/**
 * One page of folder contents; `nextPageToken` is the cursor for the next page (null on the last).
 **/
export class DriveEntryPageEntity implements DriveEntryPage {
  @ApiProperty({ type: [DriveEntryEntity], description: 'Entries in this page' })
  entries: DriveEntryEntity[];

  @ApiProperty({
    type: 'string',
    nullable: true,
    description: 'Cursor for the next page, or null when there are no more',
  })
  nextPageToken: string | null;
}
