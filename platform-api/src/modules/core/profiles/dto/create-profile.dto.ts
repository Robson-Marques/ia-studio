import { IsArray, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateProfileDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsArray()
  @IsString({ each: true })
  permissions: string[];
}
