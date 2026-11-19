import { IsNotEmpty, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class ImportWorkflowDto {
  /** JSON exportado (schema_version 1 — diretriz 29, SEM secrets). */
  @IsObject()
  @IsNotEmpty()
  data!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;
}
