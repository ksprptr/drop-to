import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

/**
 * Class representing the payload to create a subfolder.
 */
export class CreateSubfolderDto {
  @ApiProperty({
    type: 'string',
    example: 'New folder',
    description: 'Name of the subfolder to create',
    maxLength: 256,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  @Matches(/^[^/\\]+$/, { message: 'Folder name must not contain slashes.' })
  name: string;
}
