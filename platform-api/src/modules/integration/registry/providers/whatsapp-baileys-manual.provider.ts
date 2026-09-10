// Provider WhatsApp manual via Baileys (Checkpoint 4a). Canal STATEFUL que
// responde MANUALMENTE uma conversa, vinculado a um número oficial (Meta/YCloud).
// A origem oficial da conversa é preservada; este canal só é usado quando a
// equipe escolhe o modo manual — e, enquanto isso, IA/automações/modelos NÃO
// podem enviar por ela (coexistência; a guarda de envio entra no Checkpoint 4b).
//
// Fino de propósito (sem ciclo de módulo): o ciclo de vida do socket vive no
// WhatsappBaileysRegistryService (CommModule). `health` diz a verdade do
// pareamento lendo a WhatsappBaileysSession.
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
export class WhatsappBaileysManualProvider extends BaseProvider {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  metadata(): ProviderMetadata {
    return {
      key: 'whatsapp-baileys-manual',
      name: 'WhatsApp manual (Baileys)',
      category: ProviderCategory.COMMUNICATION,
      description:
        'Canal para responder manualmente uma conversa por um número não-oficial (Baileys), vinculado a uma conexão oficial. Não recebe conversas, não usa IA nem automações.',
      icon: 'message-circle',
      countMetric: 'whatsapp_numbers',
      capabilities: ['health'],
      wizardSchema: {
        testable: false,
        steps: [
          {
            id: 'binding',
            title: 'Vínculo com a conexão oficial',
            description:
              'Este canal manual acompanha uma conexão oficial (Meta/YCloud): as conversas continuam com a origem oficial, e este número só responde quando a equipe escolhe o modo manual.',
            fields: [
              {
                key: 'official_connection_id',
                label: 'ID da conexão oficial',
                type: 'text',
                required: true,
                help: 'ID da conexão oficial (Meta/YCloud) que este canal manual acompanha.',
              },
            ],
          },
          {
            id: 'info',
            title: 'Pareamento',
            description:
              'Salve e abra a conexão para ler o QR Code no WhatsApp do MESMO número oficial (Aparelhos conectados). Este canal só responde manualmente — sem IA, disparos ou modelos.',
            fields: [],
          },
        ],
      },
    };
  }

  override async connect(_ctx: ProviderContext, _config: Record<string, unknown>): Promise<ConnectResult> {
    return { ok: true, detail: 'Canal manual criado. Abra-o para parear via QR Code.' };
  }

  async health(ctx: ProviderContext): Promise<HealthResult> {
    const session = await this.prisma.whatsappBaileysSession.findUnique({
      where: { connection_id: ctx.connection.id },
      select: { status: true, phone_number: true },
    });
    if (!session) {
      return { ok: false, detail: 'Canal manual ainda não pareado. Abra a conexão e leia o QR Code.', checks: { paired: false } };
    }
    const connected = session.status === 'connected';
    return {
      ok: connected,
      detail: connected
        ? `Canal manual conectado${session.phone_number ? ` (${session.phone_number})` : ''}.`
        : `Sessão ${session.status}. Abra a conexão para reconectar ou reparear.`,
      checks: { paired: true, connected },
    };
  }
}
