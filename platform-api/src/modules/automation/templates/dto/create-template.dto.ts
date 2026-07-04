import { IsEnum, IsNotEmpty, IsObject, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { TemplateChannel } from '@prisma/client';

export class CreateTemplateDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsEnum(TemplateChannel)
  channel!: TemplateChannel;

  @IsUUID()
  workspace_id!: string;

  @IsUUID()
  environment_id!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  subject?: string;

  /** Conteudo com {{variaveis}} (interpoladas no envio/render). */
  @IsString()
  @IsNotEmpty()
  body!: string;

  @IsOptional()
  @IsObject()
  meta?: Record<string, unknown>;
}
