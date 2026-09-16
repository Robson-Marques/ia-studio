// modules/comm/whatsapp/whatsapp-baileys.controller.ts
//
// Endpoints do pareamento Baileys (Checkpoint 3b): QR Code, reconectar e
// reiniciar o pareamento de uma conexão whatsapp-baileys-* da organização.
// A criação/edição da conexão continua no fluxo genérico de Conexões
// (Integrações); aqui é só o pareamento do socket.
import { Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../../shared/auth/permissions.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { WhatsappBaileysRegistryService } from './whatsapp-baileys-registry.service';

@ApiTags('Comm — WhatsApp Baileys')
@ApiBearerAuth()
@Controller('comm/whatsapp/baileys')
export class WhatsappBaileysController {
  constructor(private readonly registry: WhatsappBaileysRegistryService) {}

  @Get('connections/:id/pairing-qr')
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_CONNECTIONS_WRITE)
  pairingQr(
    @Param('id') id: string,
  ) {
    return this.registry.getPairingQr(id);
  }

  @Post('connections/:id/reconnect')
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_CONNECTIONS_WRITE)
  reconnect(
    @Param('id') id: string,
  ) {
    return this.registry.reconnect(id);
  }

  @Post('connections/:id/restart-pairing')
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_CONNECTIONS_WRITE)
  restartPairing(
    @Param('id') id: string,
  ) {
    return this.registry.restartPairing(id);
  }
}
