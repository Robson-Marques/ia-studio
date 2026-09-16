// Exige permissoes granulares (logica OR entre as listadas).
// Uso: @RequirePermissions('core.users.write')
import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'required_permissions';
export const RequirePermissions = (...perms: string[]) => SetMetadata(PERMISSIONS_KEY, perms);

// Marca superfícies administrativas da própria instalação. A autorização
// continua sendo resolvida pela ACL local: somente um perfil com o catálogo
// completo de permissões pode administrar infraestrutura compartilhada.
export const INSTALLATION_ADMIN_KEY = 'installation_admin_only';
export const InstallationAdminOnly = () => SetMetadata(INSTALLATION_ADMIN_KEY, true);
