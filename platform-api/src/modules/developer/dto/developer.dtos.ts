// DTOs do Developer Center (Fase 7 — diretriz 57). Chave em claro so existe
// na resposta de criacao; nunca entra/sai em outro lugar.
import { IsArray, IsISO8601, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateApiKeyDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  /** Escopos da Public API (ex.: 'public.read'). Vazio = sem escopo explicito. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scopes?: string[];

  /** Expiracao opcional (ISO 8601). Ausente = nao expira. */
  @IsOptional()
  @IsISO8601()
  expires_at?: string;
}
