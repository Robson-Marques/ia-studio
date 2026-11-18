import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Connection, Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { ConnectionsService } from '../../integration/connections/connections.service';
import { ConnectionsRepository } from '../../integration/connections/connections.repository';
import { SecretsService } from '../../integration/secrets/secrets.service';
import { CreateWahaNumberDto } from '../dto/create-waha-number.dto';
import { WHATSAPP_WAHA_PROVIDER_KEY } from '../../../shared/integration/whatsapp-provider.constants';
import { AuditLogService } from '../../../shared/audit/audit-log.service';
import {
  WahaApiError, WahaRefs, ensureWahaSession, getWahaMe, getWahaQr, getWahaSession, localWahaRuntime, logoutWahaSession,
  resolveWahaRuntime,
  restartWahaSession, startWahaSession,
  stopWahaSession,
} from '../../../shared/integration/waha.client';

@Injectable()
export class WhatsappWahaPairingService {
  constructor(
    private readonly connections: ConnectionsService,
    private readonly repository: ConnectionsRepository,
    private readonly secrets: SecretsService,
    private readonly audit: AuditLogService,
  ) {}

  async create(dto: CreateWahaNumberDto, userId: string | null) {
    if (!dto.risk_accepted) {
      throw new BadRequestException('Confirme que entende que a WAHA é uma conexão não oficial.');
    }
    if (!localWahaRuntime()) {
      throw new BadRequestException('O WAHA local ainda não foi provisionado nesta instalação. Reaplique a versão ou contate o administrador do servidor.');
    }
    return this.connections.create({
      provider_key: WHATSAPP_WAHA_PROVIDER_KEY,
      name: dto.name,
      config: {
        runtime: 'local_docker',
        department: dto.department?.trim() || '',
        is_default: dto.is_default ? 'sim' : 'nao',
        allow_automations: dto.allow_automations ? 'sim' : 'nao',
      },
      secrets: {
        webhook_secret: randomBytes(32).toString('hex'),
      },
    }, userId, { allowWhatsappWaha: true });
  }

  async status(id: string) {
    const { connection, refs } = await this.refs(id);
    let session = await getWahaSession(refs);
    if (!session) {
      session = await ensureWahaSession(refs, refs.webhookUrl, refs.webhookSecret);
    }
    const status = session?.status ?? 'STOPPED';
    if (status === 'WORKING') {
      const me = await getWahaMe(refs).catch(() => null);
      if (me) {
        const current = (connection.config ?? {}) as Record<string, unknown>;
        const next = { ...current };
        const phone = String(me.id ?? '').replace(/\D/g, '');
        if (phone) next['phone'] = phone;
        if (me.pushName) next['display_name'] = me.pushName;
        await this.repository.update(connection.id, {
          config: next as Prisma.InputJsonValue,
        });
      }
      await this.connections.test(connection.id).catch(() => null);
      return { status, connected: true, phone: me?.id ?? null, display_name: me?.pushName ?? null, qr: null };
    }
    let qr: string | null = null;
    if (['STARTING', 'SCAN_QR_CODE'].includes(status)) {
      try {
        const value = await getWahaQr(refs);
        qr = value.data.startsWith('data:') ? value.data : `data:${value.mimetype};base64,${value.data}`;
      } catch (error) {
        if (!(error instanceof WahaApiError) || ![404, 409].includes(error.status)) throw error;
      }
    }
    return { status, connected: false, qr };
  }

  async restart(id: string) {
    const { connection, refs } = await this.refs(id);
    await logoutWahaSession(refs).catch(() => null);
    await restartWahaSession(refs).catch(async () => startWahaSession(refs));
    await this.repository.update(connection.id, {
      status: 'PENDING_AUTH', is_active: false, status_detail: 'Aguardando leitura do novo QR Code.',
    });
    await this.audit.record({
      action: 'comm.whatsapp.waha.restart_pairing',
      entityType: 'Connection',
      entityId: connection.id,
      oldValue: { status: connection.status },
      newValue: { status: 'PENDING_AUTH' },
    });
    return { ok: true };
  }

  async disconnect(id: string) {
    const { connection, refs } = await this.refs(id);
    const session = await getWahaSession(refs);
    if (session) {
      await logoutWahaSession(refs);
      // Algumas engines já ficam STOPPED após o logout. O stop é apenas a
      // garantia de que a sessão não continuará consumindo recursos.
      await stopWahaSession(refs).catch(() => null);
    }
    await this.repository.update(connection.id, {
      status: 'DISABLED', is_active: false, last_health_ok: null,
      status_detail: 'Sessão WAHA desconectada pelo usuário.',
    });
    await this.audit.record({
      action: 'comm.whatsapp.waha.disconnect',
      entityType: 'Connection',
      entityId: connection.id,
      oldValue: { status: connection.status },
      newValue: { status: 'DISABLED' },
    });
    return { status: 'DISCONNECTED' };
  }

  private async refs(id: string): Promise<{ connection: Connection; refs: WahaRefs & { webhookUrl: string; webhookSecret: string } }> {
    const connection = await this.repository.findById(id);
    if (!connection || connection.provider_key !== WHATSAPP_WAHA_PROVIDER_KEY || !connection.secret_id) {
      throw new NotFoundException('Conexão WAHA não encontrada.');
    }
    const accessor = this.secrets.accessorFor(connection.secret_id);
    const legacyApiKey = (await accessor.get('api_key')) ?? '';
    const webhookSecret = (await accessor.get('webhook_secret')) ?? '';
    const config = (connection.config ?? {}) as Record<string, unknown>;
    const runtime = resolveWahaRuntime(config, legacyApiKey);
    if (!runtime || !webhookSecret) throw new BadRequestException('Conexão WAHA incompleta ou serviço local indisponível.');
    return { connection, refs: { ...runtime, session: `iastudio-${connection.id}`, webhookSecret } };
  }
}
