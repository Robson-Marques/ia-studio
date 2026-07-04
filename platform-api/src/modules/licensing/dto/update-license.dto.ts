import { IsDateString, IsEnum, IsObject, IsOptional, IsUUID } from 'class-validator';
import { LicenseStatus } from '@prisma/client';

export class UpdateLicenseDto {
  // Trocar de plano
  @IsOptional()
  @IsUUID()
  plan_id?: string;

  // Alterar status manualmente (TRIAL/ACTIVE/RESTRICTED/SUSPENDED/EXPIRED)
  @IsOptional()
  @IsEnum(LicenseStatus)
  status?: LicenseStatus;

  @IsOptional()
  @IsDateString()
  expires_at?: string;

  @IsOptional()
  @IsDateString()
  trial_ends_at?: string;

  // Override pontual de limites (merge por metrica sobre os do plano)
  @IsOptional()
  @IsObject()
  limits_override?: Record<string, number>;
}
