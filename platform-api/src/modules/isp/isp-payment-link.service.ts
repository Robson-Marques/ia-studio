// Link público de pagamento (frente 5). Cria o token com SNAPSHOT dos boletos e
// TTL (janela de tempo), e resolve a rota pública sem login. A instalação sai do próprio
// token. Porte do PortalAccessToken do Aquapark — SEM sessão JWT: a página só
// mostra a 2ª via e o link morre no vencimento.
import { GoneException, Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { Prisma } from '@prisma/client';
import { SettingsService } from '../core/settings/settings.service';
import { IspPaymentLinkRepository } from './isp-payment-link.repository';
import {
  ISP_PAGAMENTO_TTL_SETTING_KEY,
  ISP_PAGAMENTO_TTL_DEFAULT,
  ISP_PAGAMENTO_BASE_URL_SETTING_KEY,
} from './isp.constants';

export interface CreatePaymentLinkArgs {
  connectionId: string;
  customerRef?: string | null;
  customerName?: string | null;
  /** Boletos JÁ projetados (projectBoleto). Congelados no snapshot. */
  boletos: Record<string, unknown>[];
  createdBy?: string | null;
}

export interface PublicPaymentPage {
  customer_name: string | null;
  boletos: Record<string, unknown>[];
  expires_at: string;
  generated_at: string;
}

@Injectable()
export class IspPaymentLinkService {
  private readonly logger = new Logger(IspPaymentLinkService.name);

  constructor(
    private readonly repo: IspPaymentLinkRepository,
    private readonly settings: SettingsService,
  ) {}

  /** TTL do link em horas (1..168). Ausente/ inválido → default. */
  async getTtlHoras(): Promise<number> {
    const raw = await this.settings.getLocalValue(ISP_PAGAMENTO_TTL_SETTING_KEY);
    if (typeof raw !== 'string' || !raw.trim()) return ISP_PAGAMENTO_TTL_DEFAULT;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 && n <= 168 ? n : ISP_PAGAMENTO_TTL_DEFAULT;
  }

  /** URL pública base (sem barra final). Null = não configurada. */
  async getBaseUrl(): Promise<string | null> {
    const raw = await this.settings.getLocalValue(ISP_PAGAMENTO_BASE_URL_SETTING_KEY);
    return typeof raw === 'string' && raw.trim() ? raw.trim().replace(/\/$/, '') : null;
  }

  /**
   * Cria o link (token aleatório + snapshot dos boletos) e devolve a URL pública
   * pronta. Degradação graciosa: sem URL base configurada ou sem boletos, devolve
   * `{ error }` (a IA avisa e segue), nunca estoura pro cliente.
   */
  async createLink(
    args: CreatePaymentLinkArgs,
  ): Promise<{ url: string; token: string; expires_at: string } | { error: string }> {
    const baseUrl = await this.getBaseUrl();
    if (!baseUrl) {
      return { error: 'A URL pública do link de pagamento ainda não foi configurada em ISP → Abertura de chamado.' };
    }
    if (!args.boletos.length) {
      return { error: 'Não há boletos em aberto para gerar um link de pagamento.' };
    }
    const ttl = await this.getTtlHoras();
    const token = randomBytes(24).toString('hex'); // 48 chars — inguessável
    const expiresAt = new Date(Date.now() + ttl * 60 * 60 * 1000);
    await this.repo.create({
      connectionId: args.connectionId,
      token,
      customerRef: args.customerRef ?? null,
      customerName: args.customerName ?? null,
      snapshot: args.boletos as unknown as Prisma.InputJsonValue,
      expiresAt,
      createdBy: args.createdBy ?? null,
    });
    return { url: `${baseUrl}/pagar/${token}`, token, expires_at: expiresAt.toISOString() };
  }

  /**
   * Rota PÚBLICA: resolve o token, valida a janela e devolve os dados da página.
   * Mensagem genérica em todo caso inválido (não enumera tokens). 410 Gone quando
   * expirou/revogado/não existe.
   */
  async resolvePublic(token: string): Promise<PublicPaymentPage> {
    const link = token && /^[a-f0-9]{48}$/.test(token) ? await this.repo.findByToken(token) : null;
    if (!link || link.revoked_at || link.expires_at < new Date()) {
      throw new GoneException('Este link de pagamento expirou ou não é mais válido. Peça um novo pelo atendimento.');
    }
    await this.repo.registerOpen(link.id, !link.opened_at).catch(() => undefined);
    const snapshot = Array.isArray(link.snapshot) ? (link.snapshot as Record<string, unknown>[]) : [];
    return {
      customer_name: link.customer_name ?? null,
      boletos: snapshot,
      expires_at: link.expires_at.toISOString(),
      generated_at: link.created_at.toISOString(),
    };
  }
}
