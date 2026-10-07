import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class CompleteConnectchatCustomerLinkDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  requestId!: string;
}
