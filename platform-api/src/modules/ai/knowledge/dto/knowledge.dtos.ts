// DTOs de conhecimento (class-validator — sem any).
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsIn,
  MaxLength,
  Min,
} from 'class-validator';

export const KNOWLEDGE_SOURCE_TYPES = ['TXT', 'URL', 'PDF', 'DOCX', 'MARKDOWN'] as const;

export class CreateKnowledgeBaseDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  embedding_connection_id?: string;

  @IsOptional()
  @IsString()
  embedding_model?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  embedding_dim?: number;

  @IsOptional()
  @IsInt()
  @Min(100)
  chunk_size?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  chunk_overlap?: number;
}

export class UpdateKnowledgeBaseDto {
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
  embedding_connection_id?: string;

  @IsOptional()
  @IsInt()
  @Min(100)
  chunk_size?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  chunk_overlap?: number;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class AddDocumentDto {
  @IsString()
  @IsIn(KNOWLEDGE_SOURCE_TYPES as unknown as string[])
  source_type!: string;

  /** Texto cru (TXT/MARKDOWN). */
  @IsOptional()
  @IsString()
  text?: string;

  /** URL (source_type=URL). */
  @IsOptional()
  @IsString()
  url?: string;

  /** Arquivo previamente salvo no Storage Manager (PDF/DOCX). */
  @IsOptional()
  @IsString()
  storage_file_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  source_ref?: string;
}

export class QueryKnowledgeDto {
  @IsString()
  @MaxLength(2000)
  query!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  top_k?: number;
}

export class KnowledgeIdsDto {
  @IsArray()
  @IsString({ each: true })
  base_ids!: string[];
}
