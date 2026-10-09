import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export class SetConnectchatTypingDto {
  @ApiProperty({ enum: ['started', 'stopped'] })
  @IsIn(['started', 'stopped'])
  status!: 'started' | 'stopped';
}
