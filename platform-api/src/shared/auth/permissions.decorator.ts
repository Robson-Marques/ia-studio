// Exige permissoes granulares (logica OR entre as listadas).
// Uso: @RequirePermissions('core.users.write')
import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'required_permissions';
export const RequirePermissions = (...perms: string[]) => SetMetadata(PERMISSIONS_KEY, perms);
