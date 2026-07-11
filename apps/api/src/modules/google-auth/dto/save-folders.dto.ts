import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsNotEmpty, IsString, MaxLength, ValidateNested } from 'class-validator';

/**
 * Class representing a single folder selected through the Google Picker.
 */
export class SaveFolderItemDto {
  @ApiProperty({
    type: 'string',
    example: '1AbCdEfGhIjKlMnOpQrStUvWxYz',
    description: 'Google Drive folder ID',
    maxLength: 256,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  folderId: string;

  @ApiProperty({
    type: 'string',
    example: 'Vacation photos',
    description: 'Human-readable folder name (cached for display)',
    maxLength: 512,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  name: string;
}

/**
 * Class representing the payload persisting the Picker-selected folders.
 */
export class SaveFoldersDto {
  @ApiProperty({
    type: [SaveFolderItemDto],
    description: 'Folders authorized via the Google Picker during setup',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SaveFolderItemDto)
  folders: SaveFolderItemDto[];
}
