import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, Min } from 'class-validator';

export class UploadStatusDto {
  @ApiProperty({ type: 'string', description: 'The resumable session URL to query' })
  @IsString()
  uploadUrl: string;

  @ApiProperty({ type: 'integer', description: 'Total file size in bytes' })
  @IsInt()
  @Min(1)
  size: number;
}
