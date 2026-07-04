import { IsNotEmpty, IsObject } from 'class-validator';

export class RotateSecretDto {
  /** Campo → novo valor em claro (cifrado no service; nunca logado). */
  @IsObject()
  @IsNotEmpty()
  values!: Record<string, string>;
}
