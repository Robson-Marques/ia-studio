// modules/comm/whatsapp/whatsapp-baileys.controller.ts
//
// Endpoints do pareamento Baileys (Checkpoint 3b): QR Code, reconectar e
// reiniciar o pareamento de uma conexão whatsapp-baileys-* da organização.
// A criação/edição da conexão continua no fluxo genérico de Conexões
// (Integrações); aqui é só o pareamento do socket.
import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../../shared/auth/permissions.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import { AuthenticatedUser } from '../../../shared/auth/auth.types';
import { resolveOrganizationId } from '../../../shared/auth/tenant.util';
import { WhatsappBaileysRegistryService } from './whatsapp-baileys-registry.service';

@ApiTags('Comm — WhatsApp Baileys')
@ApiBearerAuth()
@Controller('comm/whatsapp/baileys')
export class WhatsappBaileysController {
  constructor(private readonly registry: WhatsappBaileysRegistryService) {}

  @Get('connections/:id/pairing-qr')
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_CONNECTIONS_WRITE)
  pairingQr(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.registry.getPairingQr(id, resolveOrganizationId(user, orgQuery));
  }

  @Post('connections/:id/reconnect')
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_CONNECTIONS_WRITE)
  reconnect(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.registry.reconnect(id, resolveOrganizationId(user, orgQuery));
  }

  @Post('connections/:id/restart-pairing')
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_CONNECTIONS_WRITE)
  restartPairing(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.registry.restartPairing(id, resolveOrganizationId(user, orgQuery));
  }
}
