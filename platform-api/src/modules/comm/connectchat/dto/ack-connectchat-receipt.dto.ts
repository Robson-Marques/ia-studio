import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class AckConnectchatReceiptDto {
  @ApiProperty({ pattern: '^[0-9]+$' })
  @IsString()
  @Matches(/^\d+$/)
  sequence!: string;
}
