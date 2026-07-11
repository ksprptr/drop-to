import { ApiProperty } from '@nestjs/swagger';

/**
 * Class representing a response entity
 */
export class ResponseEntity {
  @ApiProperty({
    type: 'number',
    description: 'Response status code',
  })
  status: number;

  @ApiProperty({
    type: 'string',
    description: 'Response status message',
  })
  message: string;
}
