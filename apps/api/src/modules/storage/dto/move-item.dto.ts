import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/**
 * Class representing the payload to move a file or subfolder into another folder.
 */
export class MoveItemDto {
  @ApiProperty({
    type: 'string',
    description: 'Id of the destination folder (a folder/bucket within the authorized scope)',
  })
  @IsString()
  @IsNotEmpty()
  targetFolderId: string;
}
