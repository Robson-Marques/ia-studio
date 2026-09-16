// Arquivos do Storage Manager — download SEMPRE por rota autenticada
// (diretriz 21). Gating: leitura de integracao (o catalogo de perms da
// Fase 2 nao define perm propria de storage; connections.read cobre).
import { Controller, Get, Param, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../../shared/auth/permissions.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { StorageService } from './storage.service';

@ApiTags('Integrations — Storage')
@ApiBearerAuth()
@Controller('storage')
export class StorageController {
  constructor(private readonly storage: StorageService) {}

  @Get('files')
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_CONNECTIONS_READ)
  list() {
    return this.storage.list();
  }

  @Get('files/:id')
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_CONNECTIONS_READ)
  async download(
    @Param('id') id: string,
  ): Promise<StreamableFile> {
    const { file, content } = await this.storage.getContent(id);
    return new StreamableFile(content, {
      type: file.mime,
      disposition: `inline; filename="${encodeURIComponent(file.original_name)}"`,
    });
  }
}
