/** Payload assinado no JWT (8h). */
export interface JwtPayload {
  sub: string;
  email: string;
  profile_id?: string | null;
  iat?: number;
  exp?: number;
}

/** Objeto `request.user` apos o JwtStrategy.validate. */
export interface AuthenticatedUser {
  sub: string;
  email: string;
  profile_id: string | null;
  /** ACL efetiva populada pelo PermissionsGuard. */
  permissions?: string[];
}

/** Request HTTP com o usuario local autenticado. */
export interface RequestWithUser {
  user?: AuthenticatedUser;
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
  query?: Record<string, unknown>;
}
