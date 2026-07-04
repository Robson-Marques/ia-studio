import { IsOptional, IsUUID, ValidateIf } from 'class-validator';

export class SetMembershipDto {
  @IsUUID()
  workspace_id: string;

  // Perfil do membro NAQUELE workspace (null = herda so o perfil do usuario)
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsUUID()
  profile_id?: string | null;
}
