import { IsEmail, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateUserDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsOptional()
  @IsUUID()
  profile_id?: string;

  // Telefone (WhatsApp) para notificacoes internas (ex.: alerta de incidente ISP).
  @IsOptional()
  @IsString()
  whatsapp_phone?: string;
}
