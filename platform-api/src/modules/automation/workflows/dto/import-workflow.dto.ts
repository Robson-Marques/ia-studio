import { IsNotEmpty, IsObject, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class ImportWorkflowDto {
  @IsUUID()
  workspace_id!: string;

  @IsUUID()
  environment_id!: string;

  /** JSON exportado (schema_version 1 — diretriz 29, SEM secrets). */
  @IsObject()
  @IsNotEmpty()
  data!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;
}
