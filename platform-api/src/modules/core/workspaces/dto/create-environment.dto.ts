import { IsBoolean, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { EnvironmentKind } from '@prisma/client';

export class CreateEnvironmentDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsEnum(EnvironmentKind)
  kind: EnvironmentKind;

  @IsOptional()
  @IsBoolean()
  is_default?: boolean;
}
