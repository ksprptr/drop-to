import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsString, Max, MaxLength, Min } from 'class-validator';

// Keep in sync with the controller's MAX_UPLOAD_BYTES.
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024;

export class CreateUploadSessionDto {
  @ApiProperty({ type: 'string', description: 'File name to store', maxLength: 512 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  name: string;

  @ApiProperty({ type: 'string', description: 'MIME type of the file', maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  mimeType: string;

  @ApiProperty({ type: 'integer', description: 'File size in bytes', minimum: 1, maximum: MAX_UPLOAD_BYTES })
  @IsInt()
  @Min(1)
  @Max(MAX_UPLOAD_BYTES)
  size: number;
}
