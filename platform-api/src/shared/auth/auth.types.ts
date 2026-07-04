// Tipos do dominio de autenticacao — dois atores (diretriz 41):
//   'platform' = admin de plataforma (Console)  |  'org' = usuario de organization
export type ActorType = 'platform' | 'org';

/** Payload assinado no JWT (8h). */
export interface JwtPayload {
  sub: string;
  email: string;
  actor: ActorType;
  organization_id?: string | null;
  profile_id?: string | null;
  iat?: number;
  exp?: number;
}

/** Objeto `request.user` apos o JwtStrategy.validate. */
export interface AuthenticatedUser {
  sub: string;
  email: string;
  actor: ActorType;
  organization_id: string | null;
  profile_id: string | null;
  is_platform_admin: boolean;
  /** ACL efetiva populada pelo PermissionsGuard (['*'] = bypass). */
  permissions?: string[];
}

/** Request HTTP com user + headers de escopo de tenant. */
export interface RequestWithUser {
  user?: AuthenticatedUser;
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
  query?: Record<string, unknown>;
}
