import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class MoveItemDto {
  @ApiProperty({
    type: 'string',
    description: 'Id of the destination folder (a folder/bucket within the authorized scope)',
  })
  @IsString()
  @IsNotEmpty()
  targetFolderId: string;
}
