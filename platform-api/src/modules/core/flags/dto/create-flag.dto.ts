import { IsBoolean, IsDateString, IsOptional, IsString, Matches } from 'class-validator';

export class CreateFlagDto {
  @IsString()
  @Matches(/^[A-Z0-9_.:-]+$/i, { message: 'key deve conter apenas letras, números e _ . : -' })
  key: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  // Validade da flag (expirada = desabilitada na avaliacao)
  @IsOptional()
  @IsDateString()
  expires_at?: string;
}
