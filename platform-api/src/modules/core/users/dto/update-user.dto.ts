import { IsBoolean, IsEmail, IsOptional, IsString, IsUUID, MinLength, ValidateIf } from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  // Trocar senha do usuario (reset administrativo)
  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  // profile_id: uuid ou null (desvincular perfil)
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsUUID()
  profile_id?: string | null;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
