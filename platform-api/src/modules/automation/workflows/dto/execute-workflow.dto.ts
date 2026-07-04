import { IsBoolean, IsObject, IsOptional } from 'class-validator';

export class ExecuteWorkflowDto {
  @IsOptional()
  @IsObject()
  input?: Record<string, unknown>;

  /** Simulacao (diretriz 27): nos side-effect logam "simulado" e mockam. */
  @IsOptional()
  @IsBoolean()
  dry_run?: boolean;
}
