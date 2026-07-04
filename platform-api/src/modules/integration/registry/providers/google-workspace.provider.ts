// Provider Google Workspace (Fase 7 — Email Platform). Gmail via REST HTTP
// (sem SDK), autenticado por OAuth2. O fluxo de consentimento roda no
// GoogleOauthController (Integration Manager); aqui ficam:
//   - health()/discover(): validam o access token (userinfo + labels)
//   - execute(): email.send/list/search/get/labels/threads
//   - refresh automatico do access token: quando expira, usa o refresh token
//     cifrado no Secret e persiste o novo par (oauth_meta.expires_at).
// TOKEN_EXPIRED = refresh falhou (reautenticar). Providers NUNCA leem o Secret
// direto — tudo via ctx.secrets (SecretsAccessor).
import { BadRequestException, Injectable } from '@nestjs/common';
import { ProviderCategory } from '@prisma/client';
import { BaseProvider } from './base.provider';
import {
  DiscoveredResource,
  DiscoveryResult,
  HealthResult,
  ProviderContext,
  ProviderMetadata,
} from '../../../../shared/integration/provider.interface';
import {
  buildConsentUrl,
  buildMimeBase64Url,
  getUserEmail,
  gmailGetMessage,
  gmailListLabels,
  gmailListMessages,
  gmailListThreads,
  gmailSend,
  readGoogleOAuthConfig,
  refreshAccessToken,
} from '../../../../shared/integration/google-gmail.client';

export const GOOGLE_WORKSPACE_PROVIDER_KEY = 'google-workspace';

/** Erro de sistema para sinalizar reautenticacao (connection → TOKEN_EXPIRED). */
export class TokenExpiredError extends Error {
  constructor(message = 'Autorização Google expirada — reconecte a conta.') {
    super(message);
    this.name = 'TokenExpiredError';
  }
}

// Margem de seguranca antes do expires_at real pra renovar (evita corrida).
const REFRESH_MARGIN_MS = 60_000;

@Injectable()
export class GoogleWorkspaceProvider extends BaseProvider {
  metadata(): ProviderMetadata {
    return {
      key: GOOGLE_WORKSPACE_PROVIDER_KEY,
      name: 'Google Workspace (Gmail)',
      category: ProviderCategory.COMMUNICATION,
      description:
        'Gmail via API oficial (OAuth2) — enviar, listar, buscar e ler e-mails, labels e threads.',
      icon: 'mail',
      secretKind: 'OAUTH',
      countMetric: 'google_accounts',
      capabilities: [
        'health',
        'discover',
        'execute:email.send',
        'execute:email.list',
        'execute:email.search',
        'execute:email.get',
        'execute:email.labels',
        'execute:email.threads',
      ],
      wizardSchema: {
        testable: false, // ativacao vem do callback OAuth, nao do health inicial
        steps: [
          {
            id: 'google-oauth',
            title: 'Entrar com Google',
            description:
              'Ao salvar, a conexão fica “Aguardando autenticação”. Use o botão “Entrar com Google” na tela de Conexões para autorizar o acesso à conta Gmail (envio e leitura). Os tokens ficam no Cofre de Segredos.',
            fields: [
              {
                key: 'from_email',
                label: 'E-mail remetente (opcional)',
                type: 'text',
                help: 'Endereço padrão de envio. Se vazio, usa o e-mail da conta autenticada.',
                placeholder: 'nome@empresa.com',
              },
            ],
          },
        ],
      },
    };
  }

  /** health = valida access token (com refresh) consultando o e-mail da conta. */
  async health(ctx: ProviderContext): Promise<HealthResult> {
    try {
      const accessToken = await this.ensureAccessToken(ctx);
      const email = await getUserEmail(accessToken);
      return {
        ok: true,
        detail: email ? `Conta autenticada: ${email}` : 'Token Google válido.',
        checks: { token: true, account: Boolean(email) },
      };
    } catch (e) {
      if (e instanceof TokenExpiredError) {
        return { ok: false, detail: e.message, checks: { token: false } };
      }
      return { ok: false, detail: (e as Error).message, checks: { token: false } };
    }
  }

  override async execute(ctx: ProviderContext, operation: string, params: unknown): Promise<unknown> {
    const accessToken = await this.ensureAccessToken(ctx);
    const p = (params ?? {}) as Record<string, unknown>;

    switch (operation) {
      case 'email.send': {
        const to = this.recipients(p['to']);
        if (!to.length) throw new BadRequestException('email.send exige "to".');
        const subject = typeof p['subject'] === 'string' ? (p['subject'] as string) : '';
        const html = typeof p['html'] === 'string' ? (p['html'] as string) : undefined;
        const text = typeof p['text'] === 'string' ? (p['text'] as string) : undefined;
        if (!html && !text) throw new BadRequestException('email.send exige "html" ou "text".');
        const from = await this.fromAddress(ctx, accessToken, p['from_name']);
        const raw = buildMimeBase64Url({
          from,
          to,
          cc: this.recipients(p['cc']),
          bcc: this.recipients(p['bcc']),
          subject,
          html,
          text,
          replyTo: typeof p['reply_to'] === 'string' ? (p['reply_to'] as string) : undefined,
        });
        const sent = (await gmailSend(accessToken, raw)) as { id?: string; threadId?: string };
        return { message_id: sent.id, thread_id: sent.threadId, to };
      }
      case 'email.list':
      case 'email.search': {
        const q = typeof p['q'] === 'string' ? (p['q'] as string) : undefined;
        const max = Number(p['max_results'] ?? 25) || 25;
        return gmailListMessages(accessToken, q, max);
      }
      case 'email.get': {
        const id = typeof p['id'] === 'string' ? (p['id'] as string) : '';
        if (!id) throw new BadRequestException('email.get exige "id".');
        return gmailGetMessage(accessToken, id);
      }
      case 'email.labels':
        return gmailListLabels(accessToken);
      case 'email.threads': {
        const q = typeof p['q'] === 'string' ? (p['q'] as string) : undefined;
        const max = Number(p['max_results'] ?? 25) || 25;
        return gmailListThreads(accessToken, q, max);
      }
      default:
        throw new BadRequestException(`Operação "${operation}" não suportada pelo provider google-workspace.`);
    }
  }

  override async discover(ctx: ProviderContext): Promise<DiscoveryResult> {
    const accessToken = await this.ensureAccessToken(ctx);
    const resources: DiscoveredResource[] = [];
    const email = await getUserEmail(accessToken).catch(() => null);
    if (email) resources.push({ kind: 'email_account', id: email, name: email });
    const labels = (await gmailListLabels(accessToken).catch(() => null)) as
      | { labels?: Array<{ id?: string; name?: string; type?: string }> }
      | null;
    for (const label of labels?.labels ?? []) {
      if (!label.id) continue;
      resources.push({
        kind: 'label',
        id: label.id,
        name: label.name ?? label.id,
        meta: { type: label.type },
      });
    }
    return { resources };
  }

  // ─── OAuth / token ──────────────────────────────────

  /**
   * Garante um access token valido: usa o corrente se ainda nao expirou;
   * senao renova via refresh token e persiste. Lanca TokenExpiredError quando
   * nao ha refresh ou o refresh falhou (o service marca TOKEN_EXPIRED).
   */
  private async ensureAccessToken(ctx: ProviderContext): Promise<string> {
    const access = await ctx.secrets.get('access_token');
    const meta = await ctx.secrets.getOauthMeta();
    const expiresAt = typeof meta?.expires_at === 'number' ? meta.expires_at : 0;
    const stillValid = access && expiresAt > Date.now() + REFRESH_MARGIN_MS;
    if (stillValid) return access as string;

    // Precisa renovar.
    const refresh = await ctx.secrets.get('refresh_token');
    if (!refresh) {
      throw new TokenExpiredError('Conta Google sem refresh token — reautentique com “Entrar com Google”.');
    }
    const cfg = readGoogleOAuthConfig();
    if (!cfg.clientId || !cfg.clientSecret) {
      throw new BadRequestException('OAuth do Google não configurado no servidor (GOOGLE_CLIENT_ID/SECRET).');
    }
    try {
      const token = await refreshAccessToken(cfg, refresh);
      const newExpiresAt = Date.now() + (token.expires_in ?? 3600) * 1000;
      await ctx.secrets.updateOauth(
        {
          access_token: token.access_token,
          // O Google normalmente NAO devolve refresh_token no refresh — mantem o atual.
          refresh_token: token.refresh_token ?? refresh,
        },
        { expires_at: newExpiresAt, account: meta?.account, scope: token.scope ?? meta?.scope },
      );
      return token.access_token;
    } catch (e) {
      const err = e as Error & { status?: number };
      // 400/401 do endpoint de token = refresh invalido/revogado → reautenticar.
      if (err.status === 400 || err.status === 401) {
        throw new TokenExpiredError();
      }
      throw err;
    }
  }

  private async fromAddress(
    ctx: ProviderContext,
    accessToken: string,
    fromName: unknown,
  ): Promise<string> {
    const config = (ctx.connection.config ?? {}) as Record<string, unknown>;
    const configured = typeof config['from_email'] === 'string' ? (config['from_email'] as string) : '';
    const meta = await ctx.secrets.getOauthMeta();
    const email = configured || meta?.account || (await getUserEmail(accessToken)) || '';
    if (!email) throw new BadRequestException('Não foi possível determinar o e-mail remetente da conta Google.');
    const name = typeof fromName === 'string' && fromName.trim() ? fromName.trim() : undefined;
    return name ? `${name} <${email}>` : email;
  }

  private recipients(raw: unknown): string[] {
    if (typeof raw === 'string') {
      return raw.split(/[,;]/).map((r) => r.trim()).filter(Boolean);
    }
    if (Array.isArray(raw)) {
      return raw.filter((r): r is string => typeof r === 'string' && r.trim().length > 0).map((r) => r.trim());
    }
    return [];
  }

  /** Usado pelo OAuth controller: monta a URL de consentimento com o state. */
  buildConsentUrl(state: string, loginHint?: string): string {
    const cfg = readGoogleOAuthConfig();
    if (!cfg.clientId || !cfg.redirectUri) {
      throw new BadRequestException(
        'OAuth do Google não configurado (GOOGLE_CLIENT_ID/GOOGLE_OAUTH_REDIRECT ausentes).',
      );
    }
    return buildConsentUrl(cfg, state, loginHint);
  }
}
