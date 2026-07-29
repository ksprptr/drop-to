import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export class RenameItemDto {
  @ApiProperty({
    type: 'string',
    example: 'Renamed file.txt',
    description: 'New name for the file or subfolder',
    maxLength: 256,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  @Matches(/^[^/\\]+$/, { message: 'Name must not contain slashes.' })
  name: string;
}
