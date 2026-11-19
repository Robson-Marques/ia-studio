import { IsEmail, IsOptional, IsUUID } from 'class-validator';

export class CreateInviteDto {
  @IsEmail()
  email: string;

  // Perfil pre-definido do convidado (opcional)
  @IsOptional()
  @IsUUID()
  profile_id?: string;
}
