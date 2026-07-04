import { IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { ChargeStatus } from '@prisma/client';

export class CreateChargeDto {
  @IsUUID()
  organization_id: string;

  @IsOptional()
  @IsUUID()
  subscription_id?: string;

  @IsInt()
  @Min(1)
  amount_cents: number;

  @IsOptional()
  @IsEnum(ChargeStatus)
  status?: ChargeStatus;

  // pix | credit_card | boleto | manual...
  @IsOptional()
  @IsString()
  method?: string;

  @IsOptional()
  @IsDateString()
  due_date?: string;

  @IsOptional()
  @IsString()
  external_ref?: string;
}
