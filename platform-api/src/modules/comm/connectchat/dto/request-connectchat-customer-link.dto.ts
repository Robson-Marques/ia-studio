import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class RequestConnectchatCustomerLinkDto {
  @ApiProperty({ example: '123', description: 'Código numérico do cliente na conexão IXC ativa.' })
  @IsString()
  @Matches(/^[1-9]\d*$/)
  customerId!: string;
}
