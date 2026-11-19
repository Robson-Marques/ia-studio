import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateConnectionDto {
  @IsString()
  @IsNotEmpty()
  provider_key!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  /** Campos NAO sensiveis do wizard (base_url, host, porta...). */
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  /** Campos secretos do wizard (campo → valor) — vao pro Secrets Manager. */
  @IsOptional()
  @IsObject()
  secrets?: Record<string, string>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;
}
