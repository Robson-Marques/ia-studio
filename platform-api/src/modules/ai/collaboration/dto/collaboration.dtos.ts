// DTOs das regras de colaboracao entre agentes (class-validator; sem any).
import { AiCollaborationOutputMode, AiCollaborationTriggerMode } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateCollaborationRuleDto {
  /** Agente que delega/consulta (dono da regra). */
  @IsString()
  principal_agent_id!: string;

  /** Agente especialista consultado. */
  @IsString()
  collaborator_agent_id!: string;

  /** Modo de saida: CONSULTANT (padrao) ou INTERNAL_NOTE. */
  @IsOptional()
  @IsEnum(AiCollaborationOutputMode)
  output_mode?: AiCollaborationOutputMode;

  /** Gatilho: ON_DEMAND (padrao) ou ALWAYS. */
  @IsOptional()
  @IsEnum(AiCollaborationTriggerMode)
  trigger_mode?: AiCollaborationTriggerMode;

  /** Rotulo amigavel da regra. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;
}

export class UpdateCollaborationRuleDto {
  @IsOptional()
  @IsEnum(AiCollaborationOutputMode)
  output_mode?: AiCollaborationOutputMode;

  @IsOptional()
  @IsEnum(AiCollaborationTriggerMode)
  trigger_mode?: AiCollaborationTriggerMode;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
