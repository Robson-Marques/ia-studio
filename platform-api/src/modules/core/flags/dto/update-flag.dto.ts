import { IsBoolean, IsDateString, IsOptional, IsString } from 'class-validator';

export class UpdateFlagDto {
  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsDateString()
  expires_at?: string;
}
