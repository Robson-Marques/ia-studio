// usePermissions — permissões do usuário da instalação.
//
// Padrao unico: 'dominio.acao' (ponto), ex: 'core.users.read', 'profiles.manage'.
// Catalogo central no backend: permissions.constants.ts.
// Vem via /auth/me → permissions: string[].
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

  function can(action) {
    if (!action) return false;
    return perms.includes(action);
  }

  return {
    permissions: perms,
    can,
  };
}
