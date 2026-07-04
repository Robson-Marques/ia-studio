import { IsArray, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateWorkflowDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsUUID()
  workspace_id!: string;

  @IsUUID()
  environment_id!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}
