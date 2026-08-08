// Resolucao de tenant por HOST (fase 2 da frente de tenancy).
//
// REGRA DE ISOLAMENTO (nao afrouxar): o Host decide APENAS a apresentacao —
// qual marca a tela de login mostra e qual superficie o endereco serve. Quem
// governa acesso a dado continua sendo o JWT + `organization_id` em toda query.
// Host NUNCA concede acesso a organizacao nenhuma.
//
// DEGRADACAO GRACIOSA: host nao cadastrado (ou nao ACTIVE) resolve para `null`
// e o sistema segue exatamente como hoje (instalacao de dominio unico). Nada
// quebra enquanto o registro estiver vazio.
import { Injectable, Logger } from '@nestjs/common';
import { DomainStatus } from '@prisma/client';
import { PlatformDomainsRepository } from './platform-domains.repository';
import { normalizeHostname } from './platform-domains.helpers';

export interface TenantContext {
  hostname: string;
  scope: 'PLATFORM' | 'ORGANIZATION';
  surface: 'ADMIN' | 'CONSOLE' | 'API';
  organization: {
    id: string;
    name: string;
    slug: string;
    branding: unknown;
  } | null;
}

/**
 * TTL curto do cache de resolucao (diretriz de cache de config: <= 60s).
 * NOTA: o cache e por PROCESSO. Com api + worker separados, o `invalidate()` de
 * uma mutation so alcanca o processo que atendeu a chamada — os demais corrigem
 * sozinhos ao vencer o TTL. Janela de divergencia aceita: <= 30s, e afeta so a
 * marca exibida no login (nunca acesso a dado).
 */
const CACHE_TTL_MS = 30_000;

@Injectable()
export class HostResolverService {
  private readonly logger = new Logger(HostResolverService.name);
  private readonly cache = new Map<string, { at: number; value: TenantContext | null }>();

  constructor(private readonly repository: PlatformDomainsRepository) {}

  /**
   * Extrai o host da requisicao. O nginx da instalacao repassa o host original
   * em `Host` (proxy_set_header Host $host), entao `Host` tem PRECEDENCIA:
   * `x-forwarded-host` e forjavel pelo cliente e so serve de reserva quando o
   * `Host` nao veio. Como esta rota so devolve marca publica, o pior caso de um
   * header forjado seria pintar a marca errada na propria tela de quem forjou —
   * ainda assim, preferir o header que o nosso proxy controla fecha a porta.
   */
  hostFromHeaders(headers: Record<string, unknown>): string {
    const host = headers['host'];
    const fwd = headers['x-forwarded-host'];
    const raw = (typeof host === 'string' && host) || (typeof fwd === 'string' && fwd) || '';
    // Com varios proxies o header pode vir "a.com, b.com" — o primeiro e o do cliente.
    return normalizeHostname(String(raw).split(',')[0]);
  }

  /**
   * Contexto do host, ou `null` quando o endereco nao esta cadastrado/ativo.
   * Organizacao inativa tambem resolve para `null` (nao expoe marca de cliente
   * fora de operacao).
   */
  async resolve(rawHost: string): Promise<TenantContext | null> {
    const hostname = normalizeHostname(rawHost);
    if (!hostname) return null;

    const hit = this.cache.get(hostname);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

    let value: TenantContext | null = null;
    try {
      const domain = await this.repository.findByHostname(hostname);
      if (domain && domain.status === DomainStatus.ACTIVE) {
        const org = domain.organization;
        const orgUsable = !org || org.is_active;
        if (orgUsable) {
          value = {
            hostname: domain.hostname,
            scope: domain.scope as TenantContext['scope'],
            surface: domain.surface as TenantContext['surface'],
            organization: org
              ? { id: org.id, name: org.name, slug: org.slug, branding: org.branding }
              : null,
          };
        }
      }
    } catch (e) {
      // Falha de leitura NAO pode derrubar o login — cai no comportamento padrao.
      this.logger.warn(`Falha ao resolver o host "${hostname}": ${(e as Error).message}`);
      return null;
    }

    this.cache.set(hostname, { at: Date.now(), value });
    return value;
  }

  /** Invalida o cache (chamado pelas mutations do registro de dominios). */
  invalidate(hostname?: string): void {
    if (hostname) this.cache.delete(normalizeHostname(hostname));
    else this.cache.clear();
  }
}
