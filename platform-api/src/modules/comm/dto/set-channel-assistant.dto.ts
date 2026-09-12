// Corpo do PUT do vínculo assistente↔número.
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class SetChannelAssistantDto {
  @IsString()
  agent_id!: string;

  /** Liga/desliga o atendimento automático sem desfazer o vínculo. Padrão: true. */
  @IsOptional()
  @IsBoolean()
  is_enabled?: boolean;
}
