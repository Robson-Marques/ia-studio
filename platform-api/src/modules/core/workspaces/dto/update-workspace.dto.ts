import { IsBoolean, IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class UpdateWorkspaceDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, { message: 'slug deve ser kebab-case (a-z, 0-9, hifens)' })
  slug?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
