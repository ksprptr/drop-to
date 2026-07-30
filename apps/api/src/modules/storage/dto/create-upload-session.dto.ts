import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsString, MaxLength, Min } from 'class-validator';

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

  @ApiProperty({ type: 'integer', description: 'File size in bytes', minimum: 1 })
  @IsInt()
  @Min(1)
  size: number;
}
