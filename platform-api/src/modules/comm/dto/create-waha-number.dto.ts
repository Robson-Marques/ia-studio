import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateWahaNumberDto {
  @IsString() @IsNotEmpty() name!: string;
  @IsOptional() @IsString() department?: string;
  @IsOptional() @IsBoolean() is_default?: boolean;
  @IsOptional() @IsBoolean() allow_automations?: boolean;
  @IsBoolean() risk_accepted!: boolean;
}
