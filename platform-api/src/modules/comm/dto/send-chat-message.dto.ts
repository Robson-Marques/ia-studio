import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class ChatMediaDto {
  @IsIn(['image', 'audio', 'video', 'document'])
  kind!: 'image' | 'audio' | 'video' | 'document';

  /** URL publica da midia (a Meta baixa por link nesta fase). */
  @IsString()
  @IsNotEmpty()
  url!: string;

  @IsOptional()
  @IsString()
  caption?: string;

  @IsOptional()
  @IsString()
  filename?: string;
}

export class ChatTemplateDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  language?: string;

  /** Variaveis posicionais ({'1': 'valor'}) ou por componente. */
  @IsOptional()
  @IsObject()
  variables?: Record<string, string>;
}

export class SendChatMessageDto {
  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ChatMediaDto)
  media?: ChatMediaDto;

  /** Fora da janela de 24h o envio manual exige template aprovado. */
  @IsOptional()
  @ValidateNested()
  @Type(() => ChatTemplateDto)
  template?: ChatTemplateDto;

  /** Reenvio confirmando o takeover ("assumir ao responder"). */
  @IsOptional()
  @IsBoolean()
  confirm_takeover?: boolean;
}
