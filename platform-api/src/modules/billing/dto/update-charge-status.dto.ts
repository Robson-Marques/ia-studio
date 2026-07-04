import { IsDateString, IsEnum, IsOptional } from 'class-validator';
import { ChargeStatus } from '@prisma/client';

export class UpdateChargeStatusDto {
  @IsEnum(ChargeStatus)
  status: ChargeStatus;

  @IsOptional()
  @IsDateString()
  paid_at?: string;
}
