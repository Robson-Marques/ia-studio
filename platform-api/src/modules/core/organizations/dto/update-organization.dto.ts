import { IsBoolean, IsObject, IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class UpdateOrganizationDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, { message: 'slug deve ser kebab-case (a-z, 0-9, hifens)' })
  slug?: string;

  @IsOptional()
  @IsObject()
  branding?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  custom_domain?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
