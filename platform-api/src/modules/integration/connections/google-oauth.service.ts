// Fluxo OAuth2 do Google (Fase 7 — Email Platform). Duas pontas:
//   start()    — rota autenticada: valida a conexao (google-workspace, dona da
//                org) e devolve a URL de consentimento com um `state` ASSINADO
//                (JWT curto: org + connection) — nada de segredo no state.
//   callback() — rota PUBLICA: valida o state, troca o code por access+refresh,
//                grava no Secret (Secrets Manager) e ativa a conexao.
// Provider NUNCA e chamado direto por segmento — resolucao via Registry.
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConnectionsRepository } from './connections.repository';
import { ConnectionsService } from './connections.service';
import { GoogleWorkspaceProvider, GOOGLE_WORKSPACE_PROVIDER_KEY } from '../registry/providers/google-workspace.provider';
import { exchangeCode, getUserEmail, readGoogleOAuthConfig } from '../../../shared/integration/google-gmail.client';

interface OAuthStatePayload {
  purpose: 'google_oauth';
  connection_id: string;
}

@Injectable()
export class GoogleOauthService {
  private readonly logger = new Logger(GoogleOauthService.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly connectionsRepo: ConnectionsRepository,
    private readonly connections: ConnectionsService,
    private readonly provider: GoogleWorkspaceProvider,
  ) {}

  /** Passo 1 (autenticado): devolve a URL de consentimento com state assinado. */
  async start(connectionId: string): Promise<{ url: string }> {
    const connection = await this.connectionsRepo.findById(connectionId);
    if (!connection) throw new NotFoundException('Conexão não encontrada.');
    if (connection.provider_key !== GOOGLE_WORKSPACE_PROVIDER_KEY) {
      throw new BadRequestException('Esta conexão não é do tipo Google Workspace.');
    }

    const state = await this.jwt.signAsync(
      { purpose: 'google_oauth', connection_id: connectionId } as OAuthStatePayload,
      { expiresIn: '15m' },
    );
    const config = (connection.config ?? {}) as Record<string, unknown>;
    const loginHint = typeof config['from_email'] === 'string' ? (config['from_email'] as string) : undefined;
    const url = this.provider.buildConsentUrl(state, loginHint);
    return { url };
  }

  /**
   * Passo 2 (publico): valida o state, troca o code e ativa a conexao.
   * Retorna o e-mail autenticado (a rota renderiza uma pagina simples de sucesso).
   */
  async callback(code: string, state: string): Promise<{ account: string | null; connectionId: string }> {
    let payload: OAuthStatePayload;
    try {
      payload = await this.jwt.verifyAsync<OAuthStatePayload>(state);
    } catch {
      throw new ForbiddenException('State inválido ou expirado. Reinicie a autenticação.');
    }
    if (payload.purpose !== 'google_oauth' || !payload.connection_id) {
      throw new ForbiddenException('State com propósito inválido.');
    }

    const cfg = readGoogleOAuthConfig();
    if (!cfg.clientId || !cfg.clientSecret || !cfg.redirectUri) {
      throw new BadRequestException('OAuth do Google não configurado no servidor.');
    }

    const token = await exchangeCode(cfg, code);
    if (!token.access_token || !token.refresh_token) {
      // Sem refresh_token = re-consentimento sem access_type=offline/prompt; nao ativa.
      throw new BadRequestException(
        'O Google não retornou refresh token. Reautorize concedendo acesso offline.',
      );
    }
    const account = await getUserEmail(token.access_token).catch(() => null);
    const expiresAt = Date.now() + (token.expires_in ?? 3600) * 1000;

    await this.connections.completeOAuth(
      payload.connection_id,
      { access_token: token.access_token, refresh_token: token.refresh_token },
      { expires_at: expiresAt, account: account ?? undefined, scope: token.scope },
    );
    this.logger.log(`OAuth Google concluído para conexão ${payload.connection_id} (conta ${account ?? 'n/d'}).`);
    return { account, connectionId: payload.connection_id };
  }
}
