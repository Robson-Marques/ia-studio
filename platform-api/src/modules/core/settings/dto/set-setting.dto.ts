import { IsDefined } from 'class-validator';

export class SetSettingDto {
  // Valor livre (Json) — toggles de usuario moram no banco (regra de flags)
  @IsDefined({ message: 'value é obrigatório' })
  value: unknown;
}
