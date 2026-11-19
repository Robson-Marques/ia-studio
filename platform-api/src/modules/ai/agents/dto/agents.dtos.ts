// DTOs de agentes (class-validator — sem any).
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateAgentDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  /** Connection AI (null = orchestrator resolve). */
  @IsOptional()
  @IsString()
  connection_id?: string;

  @IsString()
  @MaxLength(120)
  model!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  system_prompt?: string;

  @IsOptional()
  @IsObject()
  persona?: Record<string, unknown>;

  /** Roteiro estruturado ("O que faz"): { objetivo, passos[], situacoes[] }. */
  @IsOptional()
  @IsObject()
  roteiro?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  goal?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  max_steps?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  max_tokens?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowed_tools?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  knowledge_base_ids?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  memory_profile_ids?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  action_permissions?: string[];

  @IsOptional()
  @IsObject()
  guardrails?: Record<string, unknown>;

  /** "Como conversa": { auto_reply, debounce_seconds, split_paragraphs, supervised }. */
  @IsOptional()
  @IsObject()
  conversation?: Record<string, unknown>;
}

export class UpdateAgentDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  connection_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  model?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  system_prompt?: string;

  @IsOptional()
  @IsObject()
  persona?: Record<string, unknown>;

  /** Roteiro estruturado ("O que faz"): { objetivo, passos[], situacoes[] }. */
  @IsOptional()
  @IsObject()
  roteiro?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  goal?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  max_steps?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  max_tokens?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowed_tools?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  knowledge_base_ids?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  memory_profile_ids?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  action_permissions?: string[];

  @IsOptional()
  @IsObject()
  guardrails?: Record<string, unknown>;

  /** "Como conversa": { auto_reply, debounce_seconds, split_paragraphs, supervised }. */
  @IsOptional()
  @IsObject()
  conversation?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class SaveAgentVersionDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class PublishAgentDto {
  @IsInt()
  @Min(1)
  version!: number;
}

export class ExecuteAgentDto {
  @IsString()
  @MaxLength(20000)
  input!: string;

  @IsOptional()
  @IsBoolean()
  dry_run?: boolean;

  @IsOptional()
  @IsObject()
  scope_keys?: Record<string, string>;
}

export class ImportAgentDto {
  @IsObject()
  data!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;
}
