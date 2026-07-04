// usePermissions — permissoes do usuario logado (Painel do Cliente).
//
// Padrao unico: 'dominio.acao' (ponto), ex: 'core.users.read', 'profiles.manage'.
// Catalogo central no backend: permissions.constants.ts.
// Vem via /auth/me → permissions: string[].
//
// Bypass: is_platform_admin OU admin da organizacao passam tudo.
//
// Uso:
//   const { can } = usePermissions();
//   {can('users.create') && <button>Novo usuário</button>}
import { useAuth } from '../context/AuthContext';

export function usePermissions() {
  const { user, me } = useAuth();
  const u = me?.user || user || {};
  const perms = Array.isArray(me?.permissions)
    ? me.permissions
    : (Array.isArray(user?.permissions) ? user.permissions : []);

  const isOrgAdmin = Boolean(
    u.is_org_admin || u.is_admin || u.role === 'ADMIN' || u.role === 'OWNER',
  );
  const isBypass = Boolean(u.is_platform_admin) || isOrgAdmin;

  function can(action) {
    if (!action) return false;
    if (isBypass) return true;
    return perms.includes(action);
  }

  return {
    permissions: perms,
    can,
    isOrgAdmin,
    isPlatformAdmin: Boolean(u.is_platform_admin),
  };
}
