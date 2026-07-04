import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class SaveVersionDto {
  /** Grafo completo { nodes: [...], edges: [...] } — snapshot imutavel. */
  @IsObject()
  graph!: Record<string, unknown>;

  /** Trigger amigavel { type, event?, schedule? }. */
  @IsOptional()
  @IsObject()
  trigger?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}
