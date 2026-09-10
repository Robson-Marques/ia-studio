// Provider WhatsApp interno via Baileys (Checkpoint 3b). Conector STATEFUL:
// o ciclo de vida real (socket, QR, envio) vive no WhatsappBaileysRegistryService
// (CommModule) — este provider é fino de propósito, para não criar ciclo de
// módulo (registry ↔ comm). Ele existe para o tipo aparecer no marketplace/wizard
// e para a conexão poder ser criada com provider_key 'whatsapp-baileys-internal'.
//
// `health` diz a VERDADE do pareamento lendo a WhatsappBaileysSession direto do
// Prisma (sem importar a CommModule) — não afirma "conectado" sem estar.
import { Injectable } from '@nestjs/common';
import { ProviderCategory } from '@prisma/client';
import { BaseProvider } from './base.provider';
import {
  ConnectResult,
  HealthResult,
  ProviderContext,
  ProviderMetadata,
} from '../../../../shared/integration/provider.interface';
import { PrismaService } from '../../../../shared/prisma/prisma.service';

@Injectable()
export class WhatsappBaileysInternalProvider extends BaseProvider {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  metadata(): ProviderMetadata {
    return {
      key: 'whatsapp-baileys-internal',
      name: 'WhatsApp interno (Baileys)',
      category: ProviderCategory.COMMUNICATION,
      description:
        'Número WhatsApp isolado, só para avisos internos da equipe (não-oficial, via Baileys). Não recebe conversas nem alimenta IA. Pareamento por QR Code.',
      icon: 'message-circle',
      countMetric: 'whatsapp_numbers',
      // Sem execute: o envio interno passa pelo runtime (registry), não por
      // IProvider.execute. Só health/discover fazem sentido aqui.
      capabilities: ['health'],
      wizardSchema: {
        testable: false,
        steps: [
          {
            id: 'info',
            title: 'Número interno (Baileys)',
            description:
              'Dê um nome à conexão e salve. Depois, abra-a para ler o QR Code e parear o número no WhatsApp (Aparelhos conectados). Use um número dedicado a avisos internos — ele não recebe conversas de clientes.',
            fields: [],
          },
        ],
      },
    };
  }

  override async connect(_ctx: ProviderContext, _config: Record<string, unknown>): Promise<ConnectResult> {
    // Pareamento é ação consciente do usuário (abre a conexão → QR). Nada a
    // validar no momento da criação.
    return { ok: true, detail: 'Conexão criada. Abra-a para parear via QR Code.' };
  }

  async health(ctx: ProviderContext): Promise<HealthResult> {
    const session = await this.prisma.whatsappBaileysSession.findUnique({
      where: { connection_id: ctx.connection.id },
      select: { status: true, phone_number: true },
    });
    if (!session) {
      return { ok: false, detail: 'Número ainda não pareado. Abra a conexão e leia o QR Code.', checks: { paired: false } };
    }
    const connected = session.status === 'connected';
    return {
      ok: connected,
      detail: connected
        ? `Número interno conectado${session.phone_number ? ` (${session.phone_number})` : ''}.`
        : `Sessão ${session.status}. Abra a conexão para reconectar ou reparear.`,
      checks: { paired: true, connected },
    };
  }
}
