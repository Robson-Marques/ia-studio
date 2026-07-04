// Arquivos do Storage Manager — download SEMPRE por rota autenticada
// (diretriz 21). Gating: leitura de integracao (o catalogo de perms da
// Fase 2 nao define perm propria de storage; connections.read cobre).
import { Controller, Get, Param, Query, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../../shared/auth/permissions.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import { AuthenticatedUser } from '../../../shared/auth/auth.types';
import { resolveOrganizationId } from '../../../shared/auth/tenant.util';
import { StorageService } from './storage.service';

@ApiTags('Integrations — Storage')
@ApiBearerAuth()
@Controller('storage')
export class StorageController {
  constructor(private readonly storage: StorageService) {}

  @Get('files')
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_CONNECTIONS_READ)
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('workspace_id') workspaceId?: string,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.storage.list(resolveOrganizationId(user, orgQuery), workspaceId);
  }

  @Get('files/:id')
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_CONNECTIONS_READ)
  async download(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('organization_id') orgQuery?: string,
  ): Promise<StreamableFile> {
    const { file, content } = await this.storage.getContent(
      resolveOrganizationId(user, orgQuery),
      id,
    );
    return new StreamableFile(content, {
      type: file.mime,
      disposition: `inline; filename="${encodeURIComponent(file.original_name)}"`,
    });
  }
}
