import { IsDateString, IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

export class CreateCouponDto {
  @IsString()
  @Matches(/^[A-Z0-9_-]+$/i, { message: 'code deve conter apenas letras, números, _ e -' })
  code: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  percent_off?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  amount_off_cents?: number;

  @IsOptional()
  @IsDateString()
  valid_until?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  max_redemptions?: number;
}
