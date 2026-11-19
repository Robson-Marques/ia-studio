import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

// Segmentação local da flag: usuário ou perfil.
// Pelo menos UM alvo deve ser informado (validado no service).
export class CreateOverrideDto {
  @IsOptional()
  @IsUUID()
  user_id?: string;

  @IsOptional()
  @IsUUID()
  profile_id?: string;

  @IsBoolean()
  enabled: boolean;
}
