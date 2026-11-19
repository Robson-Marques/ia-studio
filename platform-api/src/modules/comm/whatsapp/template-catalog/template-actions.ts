// Ações nativas de botão → URL final. O template do catálogo guarda só a AÇÃO
// simbólica; aqui ela vira a URL, SEMPRE no domínio do próprio sistema (a Meta
// não aceita domínio dinâmico em botão de URL). Ação DINÂMICA carrega {{1}}
// (id/token da entidade) e exige uma URL de amostra na revisão da Meta.
//
// A base pública vem da configuração local (`system.public_url`, lida pelo service)
// — nunca de env manual (a IA/seed roda no worker, sem request). Portado do
// Aquapark (`template-actions.ts`), adaptado à instância dedicada.

export type ButtonAction =
  | 'OPEN_INCIDENTS'
  | 'OPEN_INVOICE'
  | 'OPEN_PAYMENT_PAGE'
  | 'OPEN_CHECKOUT'
  | 'OPEN_PORTAL_VERIFY';

export interface ResolvedButtonUrl {
  /** URL final, com {{1}} quando dinâmica. */
  url: string;
  /** true → precisa de variável no envio + URL de amostra na revisão da Meta. */
  dynamic: boolean;
}

/** Chave do setting (por org) com o endereço público do sistema. */
export const SYSTEM_PUBLIC_URL_SETTING_KEY = 'system.public_url';

/**
 * Resolve a ação do botão para a URL final. `base` é o endereço público da org
 * (sem barra no fim). Nova `action` = nova entrada aqui (regra de ouro).
 */
export function resolveButtonUrl(action: string, base: string): ResolvedButtonUrl {
  const b = (base || '').replace(/\/$/, '');
  switch (action) {
    case 'OPEN_INCIDENTS':    return { url: `${b}/isp/incidentes`,        dynamic: false };
    case 'OPEN_INVOICE':      return { url: `${b}/pagar/{{1}}`,           dynamic: true };
    case 'OPEN_PAYMENT_PAGE': return { url: `${b}/pagar/{{1}}`,           dynamic: true };
    case 'OPEN_CHECKOUT':     return { url: `${b}/checkout/{{1}}`,        dynamic: true };
    case 'OPEN_PORTAL_VERIFY':return { url: `${b}/cliente/verify?token={{1}}`, dynamic: true };
    default:                  return { url: b || 'https://exemplo.com',   dynamic: false };
  }
}

/** URL de amostra pra revisão da Meta: substitui {{1}} por um id/token demo. */
export function sampleButtonUrl(url: string): string {
  return url.replace(/\{\{1\}\}/g, 'exemplo123');
}
