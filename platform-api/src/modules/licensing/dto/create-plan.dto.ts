import { IsArray, IsBoolean, IsInt, IsObject, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreatePlanDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  trial_days?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  price_cents?: number;

  // Mapa metric→limite (metrica ausente = ilimitado)
  @IsOptional()
  @IsObject()
  limits?: Record<string, number>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  features?: string[];
}
