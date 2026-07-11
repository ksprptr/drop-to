import { ApiProperty } from '@nestjs/swagger';

import { AllowedFolderEntity } from './allowed-folder.entity';

/**
 * Class representing a drive account status entity
 */
export class DriveAccountStatusEntity {
  @ApiProperty({ type: 'boolean', description: 'Whether a Drive account is connected' })
  connected: boolean;

  @ApiProperty({
    type: 'string',
    nullable: true,
    description: 'Email of the connected account (null when not connected)',
  })
  email: string | null;

  @ApiProperty({ type: [AllowedFolderEntity], description: 'Authorized root folders' })
  allowedFolders: AllowedFolderEntity[];
}
