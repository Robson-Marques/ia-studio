// DTOs do catalogo de tools (class-validator — sem any).
import {
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateToolDto {
  @IsString()
  @MaxLength(60)
  @Matches(/^[a-z][a-z0-9_]*$/, { message: 'key deve ser snake_case (letras minúsculas, números e _).' })
  key!: string;

  @IsString()
  @MaxLength(120)
  name!: string;

  @IsString()
  @MaxLength(500)
  description!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  category?: string;

  @IsObject()
  input_schema!: Record<string, unknown>;

  /** { provider_key?, operation } — tool que chama connection execute. */
  @IsOptional()
  @IsObject()
  connection_operation?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  requires_approval?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1000)
  timeout_ms?: number;
}

export class UpdateToolDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  category?: string;

  @IsOptional()
  @IsObject()
  input_schema?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  connection_operation?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  requires_approval?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1000)
  timeout_ms?: number;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
