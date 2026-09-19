// Developer Center — gestao de API Keys (Fase 7 — diretriz 57). JWT + ACL.
// Criar retorna a chave em claro 1x; listar so metadados; revogar muda estado.
import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../shared/auth/permissions.decorator';
import { PERMISSIONS } from '../../shared/permissions.constants';
import { CurrentUser } from '../../shared/auth/current-user.decorator';
import { AuthenticatedUser } from '../../shared/auth/auth.types';
import { Auditable } from '../../shared/audit/auditable.decorator';
import { DeveloperService } from './developer.service';
import { CreateApiKeyDto } from './dto/developer.dtos';

@ApiTags('Desenvolvedor — API Keys')
@ApiBearerAuth()
@Controller('developer/api-keys')
export class DeveloperController {
  constructor(private readonly developer: DeveloperService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.DEVELOPER_APIKEYS_READ)
  list() {
    return this.developer.list();
  }

  @Post()
  @RequirePermissions(PERMISSIONS.DEVELOPER_APIKEYS_MANAGE)
  @Auditable({ action: 'developer.apikey.create', entityType: 'DeveloperApiKey', captureParams: true })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateApiKeyDto) {
    return this.developer.create(dto, user.sub);
  }

  @Post(':id/revoke')
  @RequirePermissions(PERMISSIONS.DEVELOPER_APIKEYS_MANAGE)
  @Auditable({ action: 'developer.apikey.revoke', entityType: 'DeveloperApiKey' })
  revoke(@Param('id') id: string) {
    return this.developer.revoke(id);
  }
}
