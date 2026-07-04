import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import { ProviderCategory } from '@prisma/client';

export class CreateProviderDefinitionDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z0-9][a-z0-9-]*$/, { message: 'key deve ser kebab-case (ex.: meu-conector).' })
  key!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsEnum(ProviderCategory)
  category!: ProviderCategory;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsObject()
  wizard_schema!: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  capabilities?: unknown[];

  @IsOptional()
  @IsBoolean()
  is_installed_by_default?: boolean;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
