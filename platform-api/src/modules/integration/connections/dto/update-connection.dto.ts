import { IsArray, IsInt, IsNotEmpty, IsObject, IsOptional, IsString, Min } from 'class-validator';

// Atualizacao de dados nao-estruturais da Instance (nome/tags/prioridade) +
// credenciais (config nao-sensivel + secrets). Estado muda SOMENTE via
// PATCH /connections/:id/state (state machine). provider_key nunca muda por aqui.
export class UpdateConnectionDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;

  /** Campos nao-sensiveis do wizard (merge shallow no config atual). */
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  /**
   * Campos secretos do wizard. So as chaves com valor nao-vazio sao
   * gravadas no Secrets Manager; chave ausente ou string vazia MANTEM o
   * segredo atual (nunca apaga).
   */
  @IsOptional()
  @IsObject()
  secrets?: Record<string, string>;
}
