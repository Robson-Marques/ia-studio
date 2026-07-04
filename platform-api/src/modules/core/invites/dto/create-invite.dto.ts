import { IsEmail, IsOptional, IsUUID } from 'class-validator';

export class CreateInviteDto {
  @IsEmail()
  email: string;

  // Workspace ao qual o convidado sera vinculado (opcional)
  @IsOptional()
  @IsUUID()
  workspace_id?: string;

  // Perfil pre-definido do convidado (opcional)
  @IsOptional()
  @IsUUID()
  profile_id?: string;
}
