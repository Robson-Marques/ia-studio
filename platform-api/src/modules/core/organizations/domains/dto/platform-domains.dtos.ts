import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateDomainDto {
  /**
   * Host completo (ex.: "acme.app.br"). Alternativa: informar `label` + deixar
   * o sistema montar sob o dominio-base (subdominio do cliente).
   */
  @IsOptional()
  @IsString()
  hostname?: string;

  /** Rotulo do subdominio (o "acme" de acme.app.br). Usado quando nao vem hostname. */
  @IsOptional()
  @IsString()
  label?: string;

  /** Org dona do host. Ausente/null = host da PLATAFORMA (Console/API/painel base). */
  @IsOptional()
  @IsUUID()
  organization_id?: string | null;

  /** Qual superficie o host serve. Default ADMIN (painel do cliente). */
  @IsOptional()
  @IsIn(['ADMIN', 'CONSOLE', 'API'])
  surface?: 'ADMIN' | 'CONSOLE' | 'API';

  /** Marcar como host canonico do escopo. */
  @IsOptional()
  @IsBoolean()
  is_primary?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateDomainDto {
  @IsOptional()
  @IsIn(['ADMIN', 'CONSOLE', 'API'])
  surface?: 'ADMIN' | 'CONSOLE' | 'API';

  /** Estado operacional. A verificacao de posse/DNS entra na fase seguinte. */
  @IsOptional()
  @IsIn(['PENDING_DNS', 'VERIFYING', 'ACTIVE', 'FAILED', 'DISABLED'])
  status?: 'PENDING_DNS' | 'VERIFYING' | 'ACTIVE' | 'FAILED' | 'DISABLED';

  @IsOptional()
  @IsString()
  notes?: string;
}

export class SetBaseDomainDto {
  @IsString()
  @MinLength(3)
  base_domain!: string;
}
