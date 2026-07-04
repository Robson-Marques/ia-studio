// usePermissions — Console do SaaS.
//
// Todo usuario do Console e platform admin (o login barra os demais), entao
// can() e um bypass — mantido pelo padrao arquitetural: todo botao sensivel
// continua envolto em can('...'), pronto pra granularidade futura de operacao.
import { useAuth } from '../context/AuthContext';

export function usePermissions() {
  const { user } = useAuth();
  const isPlatformAdmin = Boolean(user?.is_platform_admin);
  const perms = Array.isArray(user?.permissions) ? user.permissions : [];

  function can(action) {
    if (!action) return false;
    if (isPlatformAdmin) return true;
    return perms.includes(action);
  }

  return { can, permissions: perms, isPlatformAdmin };
}
