// DTOs de custos e orcamentos de IA — validados com class-validator (diretriz 9).
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class CreateBudgetDto {
  @IsString()
  workspace_id!: string;

  @IsOptional()
  @IsString()
  environment_id?: string;

  @IsNumber()
  @Min(0)
  limit_usd!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  alert_threshold_pct?: number;

  @IsOptional()
  @IsBoolean()
  block_on_exceed?: boolean;

  @IsOptional()
  @IsString()
  period_kind?: string;
}

export class UpdateBudgetDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  limit_usd?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  alert_threshold_pct?: number;

  @IsOptional()
  @IsBoolean()
  block_on_exceed?: boolean;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class SimulateCostDto {
  @IsString()
  model!: string;

  @IsInt()
  @Min(0)
  prompt_tokens!: number;

  @IsInt()
  @Min(0)
  completion_tokens!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  runs_per_month?: number;
}
