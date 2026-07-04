import { IsEmail, IsObject, IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class CreateOrganizationDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsString()
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, { message: 'slug deve ser kebab-case (a-z, 0-9, hifens)' })
  slug: string;

  // Plano da licenca TRIAL inicial; ausente = plano default (Starter / 1º ativo)
  @IsOptional()
  @IsString()
  plan_id?: string;

  @IsOptional()
  @IsObject()
  branding?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  custom_domain?: string;

  // Usuario administrador inicial da organization (opcional)
  @IsOptional()
  @IsString()
  @MinLength(2)
  admin_name?: string;

  @IsOptional()
  @IsEmail()
  admin_email?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  admin_password?: string;
}
