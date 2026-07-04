// DTOs do modulo ISP (class-validator — sem any). O escopo e um mapa de
// filtros de conectividade Altarede; validamos apenas as chaves conhecidas.
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { IspIncidentCommMode } from '@prisma/client';

export class IncidentScopeDto {
  @IsOptional() @IsString() @MaxLength(120) cidade?: string;
  @IsOptional() @IsString() @MaxLength(120) bairro?: string;
  @IsOptional() @IsString() @MaxLength(120) ip_concentrador?: string;
  @IsOptional() @IsString() @MaxLength(120) interface_concentrador?: string;
  @IsOptional() @IsString() @MaxLength(120) id_olt?: string;
  @IsOptional() @IsString() @MaxLength(120) id_slot?: string;
  @IsOptional() @IsString() @MaxLength(120) id_cto?: string;
}

export class IncidentTogglesDto {
  @IsOptional() @IsBoolean() suppress_os?: boolean;
  @IsOptional() @IsBoolean() inform_forecast?: boolean;
  @IsOptional() @IsBoolean() notify_normalization?: boolean;
}

export class CreateIncidentDto {
  @IsString() @MaxLength(160) title!: string;

  @IsOptional() @IsString() @MaxLength(2000) message?: string;

  @IsOptional() @IsString() @MaxLength(240) forecast?: string;

  @IsString() workspace_id!: string;

  @IsString() environment_id!: string;

  /** Conexao Altarede que resolve os afetados. */
  @IsString() connection_id!: string;

  @IsOptional() @IsEnum(IspIncidentCommMode) comm_mode?: IspIncidentCommMode;

  @IsOptional() @ValidateNested() @Type(() => IncidentScopeDto) scope?: IncidentScopeDto;

  @IsOptional() @ValidateNested() @Type(() => IncidentTogglesDto) toggles?: IncidentTogglesDto;

  @IsOptional() @IsString() template_active_id?: string;

  @IsOptional() @IsString() template_normalized_id?: string;
}

export class UpdateIncidentDto {
  @IsOptional() @IsString() @MaxLength(160) title?: string;
  @IsOptional() @IsString() @MaxLength(2000) message?: string;
  @IsOptional() @IsString() @MaxLength(240) forecast?: string;
  @IsOptional() @IsString() connection_id?: string;
  @IsOptional() @IsEnum(IspIncidentCommMode) comm_mode?: IspIncidentCommMode;
  @IsOptional() @ValidateNested() @Type(() => IncidentScopeDto) scope?: IncidentScopeDto;
  @IsOptional() @ValidateNested() @Type(() => IncidentTogglesDto) toggles?: IncidentTogglesDto;
  @IsOptional() @IsString() template_active_id?: string;
  @IsOptional() @IsString() template_normalized_id?: string;

  /** Deteccao automatica de outage (OFF por default — só sugere rascunho). */
  @IsOptional() @IsBoolean() auto_detect?: boolean;
}

export class ManualTargetDto {
  @IsString() @MaxLength(120) customer_ref!: string;
  @IsOptional() @IsString() @MaxLength(160) name?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
}

export class UpdateTargetsDto {
  /** IDs dos targets a incluir (checkbox). */
  @IsOptional() @IsArray() @IsString({ each: true }) included_ids?: string[];

  /** IDs dos targets a excluir do disparo. */
  @IsOptional() @IsArray() @IsString({ each: true }) excluded_ids?: string[];

  /** Vinculos manuais (cliente fora da regiao). */
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ManualTargetDto)
  manual?: ManualTargetDto[];
}

export class DispatchIncidentDto {
  /** Confirmacao explicita obrigatoria — disparo em massa e sensivel. */
  @IsBoolean() confirm!: boolean;

  /** Rate limit (mensagens/segundo). */
  @IsOptional() @IsInt() @Min(1) @Max(60) rate_per_sec?: number;

  /** true = usa o template de normalizacao (encerramento). */
  @IsOptional() @IsBoolean() normalized?: boolean;
}
