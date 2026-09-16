import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

/** Tipos de acao que uma politica pode alvejar (diretriz 31, generico). */
export const APPROVAL_TARGET_TYPES = ['TOOL', 'SQL_WRITE', 'MASS_SEND', 'COST', 'ADMIN'] as const;

export class CreateApprovalPolicyDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  @IsIn(APPROVAL_TARGET_TYPES)
  target_type!: string;

  // Forma esperada: { tool_key?, min_recipients?, min_cost_usd? }
  @IsOptional()
  @IsObject()
  condition?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  approver_profile_ids?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  approver_user_ids?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  expires_after_seconds?: number;
}

export class UpdateApprovalPolicyDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsObject()
  condition?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  approver_profile_ids?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  approver_user_ids?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  expires_after_seconds?: number;

  // Liga/desliga a politica — nasce OFF, so o usuario ativa (diretriz 31).
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class DecideApprovalDto {
  @IsBoolean()
  approve!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reject_reason?: string;
}
