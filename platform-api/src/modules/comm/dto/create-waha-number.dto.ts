import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsUrl } from 'class-validator';

export class CreateWahaNumberDto {
  @IsString() @IsNotEmpty() name!: string;
  @IsUrl({ require_tld: false }) api_url!: string;
  @IsString() @IsNotEmpty() api_key!: string;
  @IsUrl({ require_tld: false }) webhook_url!: string;
  @IsOptional() @IsString() department?: string;
  @IsOptional() @IsBoolean() is_default?: boolean;
  @IsOptional() @IsBoolean() allow_automations?: boolean;
  @IsBoolean() risk_accepted!: boolean;
}
