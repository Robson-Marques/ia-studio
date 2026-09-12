import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, ValidateNested } from 'class-validator';
import { TemplateButtonDto } from './create-template.dto';

/**
 * Edição de um template ainda em rascunho (DRAFT). Nome/idioma/conexão são a
 * identidade e não mudam aqui — só o conteúdo (header/body/footer/botões) e a
 * categoria. Templates já enviados à Meta se alteram por "editar publicado"
 * (push-edit — checkpoint futuro).
 */
export class UpdateTemplateDto {
  @IsIn(['MARKETING', 'UTILITY', 'AUTHENTICATION'])
  category!: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';

  @IsOptional()
  @IsString()
  @MaxLength(60)
  header_text?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1024)
  body_text!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  footer_text?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TemplateButtonDto)
  buttons?: TemplateButtonDto[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  body_examples?: string[];
}

/** Vincula (ou desvincula, com event vazio) o template a um evento do sistema. */
export class BindTemplateEventDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  event?: string;
}

/** Replica o template como rascunho em outras conexões WhatsApp. */
export class ReplicateTemplateDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  connection_ids!: string[];
}
