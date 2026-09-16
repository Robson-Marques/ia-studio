// DTOs do modulo Resource (class-validator — sem any).
import {
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateMappingDto {
  @IsString() @MaxLength(80) provider_key!: string;

  @IsOptional() @IsString() connection_id?: string;

  @IsString() @MaxLength(60) resource_type!: string;

  /** Operacao de origem (ex.: "cliente.dados", "financeiro.boleto_aberto"). */
  @IsString() @MaxLength(120) source_operation!: string;

  /** { canonicalField: "sourcePath" }. */
  @IsObject() field_map!: Record<string, unknown>;

  /** Extensoes verticais (namespaced). */
  @IsOptional() @IsObject() extensions?: Record<string, unknown>;

  @IsOptional() @IsString() @MaxLength(240) description?: string;

  /** Nasce OFF por padrao (diretriz de automatismos). */
  @IsOptional() @IsBoolean() is_active?: boolean;

}

export class UpdateMappingDto {
  @IsOptional() @IsString() @MaxLength(120) source_operation?: string;
  @IsOptional() @IsObject() field_map?: Record<string, unknown>;
  @IsOptional() @IsObject() extensions?: Record<string, unknown>;
  @IsOptional() @IsString() @MaxLength(240) description?: string;
  @IsOptional() @IsBoolean() is_active?: boolean;
}

// Mapper Inteligente (diretriz 25): pede amostra + sugestao de field_map.
export class SuggestMappingDto {
  @IsString() connection_id!: string;

  @IsString() @MaxLength(60) resource_type!: string;

  /** Operacao usada para colher a amostra (ex.: "cliente.dados"). */
  @IsString() @MaxLength(120) source_operation!: string;

  /** Parametros para a operacao de amostragem (ex.: { login: "teste" }). */
  @IsOptional() @IsObject() sample_params?: Record<string, unknown>;
}
