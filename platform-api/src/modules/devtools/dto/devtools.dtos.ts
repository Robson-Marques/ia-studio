// DTOs do Console do Desenvolvedor (class-validator — sem any).
import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

// Testar IProvider.execute com payload livre (via connection).
export class ExecuteTestDto {
  @IsString() connection_id!: string;
  @IsString() @MaxLength(120) operation!: string;
  @IsOptional() @IsObject() params?: Record<string, unknown>;
}

// SQL read-only por default (via connection DATABASE).
export class SqlTestDto {
  @IsString() connection_id!: string;
  @IsString() @MaxLength(20000) sql!: string;
}

export class HttpHeaderDto {
  @IsString() @MaxLength(120) key!: string;
  @IsString() @MaxLength(2000) value!: string;
}

// HTTP livre — para depurar integrações. Não persiste dado de negócio.
export class HttpTestDto {
  @IsIn(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) method!: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  @IsString() @MaxLength(2000) url!: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => HttpHeaderDto) headers?: HttpHeaderDto[];
  @IsOptional() body?: unknown;
  @IsOptional() @IsNumber() @Min(1000) @Max(60000) timeout_ms?: number;
}

// Chamada de IA (chat) via connection AI.
export class AiTestDto {
  @IsString() connection_id!: string;
  @IsString() @MaxLength(120) model!: string;
  @IsString() @MaxLength(20000) prompt!: string;
  @IsOptional() @IsString() @MaxLength(20000) system?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(2) temperature?: number;
  @IsOptional() @IsNumber() @Min(1) @Max(8000) max_tokens?: number;
}

// Rodar uma tool do catalogo de IA com input livre.
export class ToolTestDto {
  @IsString() @MaxLength(120) tool_key!: string;
  @IsObject() input!: Record<string, unknown>;
  @IsOptional() @IsString() connection_id?: string;
}
