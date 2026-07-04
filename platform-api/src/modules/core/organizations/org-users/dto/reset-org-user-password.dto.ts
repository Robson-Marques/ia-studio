import { IsString, MinLength } from 'class-validator';

export class ResetOrgUserPasswordDto {
  // Reset administrativo pelo Console — minimo 8 caracteres.
  @IsString()
  @MinLength(8)
  new_password!: string;
}
