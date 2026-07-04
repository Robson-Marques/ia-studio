import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

// Segmentacao da flag (diretriz 6): org, workspace, usuario ou perfil.
// Pelo menos UM alvo deve ser informado (validado no service).
export class CreateOverrideDto {
  @IsOptional()
  @IsUUID()
  organization_id?: string;

  @IsOptional()
  @IsUUID()
  workspace_id?: string;

  @IsOptional()
  @IsUUID()
  user_id?: string;

  @IsOptional()
  @IsUUID()
  profile_id?: string;

  @IsBoolean()
  enabled: boolean;
}
