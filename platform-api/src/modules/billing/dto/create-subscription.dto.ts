import { IsDateString, IsEnum, IsInt, IsOptional, IsUUID, Min } from 'class-validator';
import { SubscriptionStatus } from '@prisma/client';

export class CreateSubscriptionDto {
  @IsUUID()
  organization_id: string;

  @IsUUID()
  plan_id: string;

  @IsOptional()
  @IsEnum(SubscriptionStatus)
  status?: SubscriptionStatus;

  @IsOptional()
  @IsDateString()
  current_period_end?: string;

  // Grace period (diretriz 58) — default 5 dias
  @IsOptional()
  @IsInt()
  @Min(0)
  grace_days?: number;

  @IsOptional()
  @IsUUID()
  coupon_id?: string;
}
