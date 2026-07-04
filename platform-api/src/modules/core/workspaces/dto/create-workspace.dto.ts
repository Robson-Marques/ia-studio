import { IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class CreateWorkspaceDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsString()
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, { message: 'slug deve ser kebab-case (a-z, 0-9, hifens)' })
  slug: string;

  // Console pode operar em nome de uma org (?organization_id) — validado no tenant.util
  @IsOptional()
  @IsString()
  organization_id?: string;
}
