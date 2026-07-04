import { IsArray, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

// Atualizacao de dados nao-estruturais da Instance (nome/tags/prioridade).
// Estado muda SOMENTE via PATCH /connections/:id/state (state machine).
export class UpdateConnectionDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;
}
