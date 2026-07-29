import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ type: 'string', example: 'operator', description: 'Username', maxLength: 64 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  username: string;

  @ApiProperty({ type: 'string', description: 'Password', maxLength: 128 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password: string;
}
