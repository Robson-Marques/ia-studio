import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class TemplateButtonDto {
  @IsIn(['QUICK_REPLY', 'URL', 'PHONE_NUMBER'])
  type!: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER';

  @IsString()
  @IsNotEmpty()
  @MaxLength(25)
  text!: string;

  @IsOptional()
  @IsString()
  url?: string;

  @IsOptional()
  @IsString()
  phone_number?: string;
}

/**
 * Criacao de template HSM com componentes basicos (header/body/footer/buttons).
 * O template nasce local (DRAFT) e e publicado na Meta (→ PENDING) na hora.
 */
export class CreateTemplateDto {
  @IsUUID()
  connection_id!: string;

  /** Nome Meta: minusculas, numeros e underscore. */
  @IsString()
  @Matches(/^[a-z0-9_]{1,120}$/, { message: 'Nome do template: minúsculas, números e underscore.' })
  name!: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsIn(['MARKETING', 'UTILITY', 'AUTHENTICATION'])
  category!: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';

  @IsOptional()
  @IsString()
  @MaxLength(60)
  header_text?: string;

  /** Cabeçalho de MÍDIA: formato + handle obtido no upload (POST templates/header-media).
   *  Quando presente, tem precedência sobre header_text. Só um cabeçalho por template. */
  @IsOptional()
  @IsIn(['IMAGE', 'VIDEO', 'DOCUMENT'])
  header_format?: 'IMAGE' | 'VIDEO' | 'DOCUMENT';

  @IsOptional()
  @IsString()
  header_handle?: string;

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

  /** Exemplos das variaveis {{n}} do body (exigidos pela Meta quando ha variaveis). */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  body_examples?: string[];
}
