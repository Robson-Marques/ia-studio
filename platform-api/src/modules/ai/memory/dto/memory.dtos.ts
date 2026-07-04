// DTOs de memoria (class-validator — sem any).
import {
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { AiMemoryScope } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class CreateMemoryProfileDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsString()
  workspace_id!: string;

  @IsString()
  environment_id!: string;

  @IsEnum(AiMemoryScope)
  scope!: AiMemoryScope;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  max_items?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  default_ttl_seconds?: number;
}

export class UpdateMemoryProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  max_items?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  default_ttl_seconds?: number;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class WriteMemoryEntryDto {
  @IsString()
  scope_key!: string;

  @IsString()
  @MaxLength(200)
  key!: string;

  @IsObject()
  value!: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  @Min(1)
  ttl_seconds?: number;
}
