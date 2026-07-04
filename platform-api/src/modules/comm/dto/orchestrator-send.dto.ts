import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';

class SendCriteriaDto {
  @IsOptional()
  @IsString()
  tag?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsUUID()
  connectionId?: string;
}

/**
 * Envio pelo Meta Orchestrator (API): o chamador NAO indica numero — indica
 * criterios (tag/departamento) e o orchestrator resolve a conexao.
 */
export class OrchestratorSendDto {
  @IsString()
  @IsNotEmpty()
  phone!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => SendCriteriaDto)
  criteria?: SendCriteriaDto;

  /** RichMessage: { kind: 'text'|'image'|...|'template', ... } */
  @IsObject()
  message!: Record<string, unknown>;

  @IsOptional()
  @IsUUID()
  workspace_id?: string;

  @IsOptional()
  @IsUUID()
  environment_id?: string;
}
