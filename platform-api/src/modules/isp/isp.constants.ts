// Constantes da solucao ISP (Fase 6). Nenhuma dependencia de segmento no core:
// tudo que e ISP mora neste modulo, no provider altarede e nas tools ISP.

export const ALTAREDE_PROVIDER_KEY = 'altarede';

// Chaves de filtro de conectividade Altarede (conectividade/listar/com_status).
export const SCOPE_KEYS = [
  'cidade',
  'bairro',
  'ip_concentrador',
  'interface_concentrador',
  'id_olt',
  'id_slot',
  'id_cto',
] as const;

export type ScopeKey = (typeof SCOPE_KEYS)[number];

// Toggles do incidente (default de todos = false — automatismos nascem OFF).
export interface IspIncidentToggles {
  suppress_os?: boolean;
  inform_forecast?: boolean;
  notify_normalization?: boolean;
}

// Rate limit default do disparo proativo (mensagens por segundo). Configuravel
// por chamada; teto de seguranca aplicado no servico.
export const DEFAULT_DISPATCH_RATE_PER_SEC = 5;
export const MAX_DISPATCH_RATE_PER_SEC = 30;
