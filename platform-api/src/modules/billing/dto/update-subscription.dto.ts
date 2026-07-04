import { IsDateString, IsEnum, IsInt, IsOptional, IsUUID, Min } from 'class-validator';
import { SubscriptionStatus } from '@prisma/client';

export class UpdateSubscriptionDto {
  @IsOptional()
  @IsUUID()
  plan_id?: string;

  @IsOptional()
  @IsEnum(SubscriptionStatus)
  status?: SubscriptionStatus;

  @IsOptional()
  @IsDateString()
  current_period_end?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  grace_days?: number;
}
