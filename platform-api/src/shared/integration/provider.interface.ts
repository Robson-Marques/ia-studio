// Interface UNICA de provider (diretriz 2 — Provider Registry).
// Provider = tipo/conector; Instance (Connection) = conexao nomeada (diretriz 52).
// Toda implementacao registra-se no ProviderRegistryService — proibido switch
// por provider_key espalhado pelo sistema.
import { Logger } from '@nestjs/common';
import { Connection, ProviderCategory } from '@prisma/client';

// ─── Connection Wizard declarativo (spec "Connection Wizard") ───────────
// O metadata() descreve os passos; o front renderiza sem codigo por tipo.

export type WizardFieldType = 'text' | 'password' | 'url' | 'number' | 'select' | 'textarea';

export interface WizardFieldOption {
  value: string;
  label: string;
}

export interface WizardField {
  key: string;
  label: string;
  type: WizardFieldType;
  /** true = valor vai pro Secrets Manager (nunca pro config da connection). */
  secret?: boolean;
  required?: boolean;
  help?: string;
  placeholder?: string;
  options?: WizardFieldOption[];
  default?: string | number;
  /** true = o front mostra um botao "Gerar" que preenche um token aleatorio
   *  (ex.: verify_token do webhook). */
  generatable?: boolean;
}

export interface WizardStep {
  id: string;
  title: string;
  description?: string;
  fields: WizardField[];
}

export interface WizardSchema {
  steps: WizardStep[];
  /** true = wizard exibe o passo final "Testar e salvar" (health check). */
  testable: boolean;
  /** Caminho do webhook deste provider, quando aplicável. O front
   *  mostra a URL completa (origin + path) com botao copiar pra colar na Meta. */
  webhookPath?: string;
}

// ─── Metadata / resultados ──────────────────────────────────────────────

export interface ProviderMetadata {
  key: string;
  name: string;
  category: ProviderCategory;
  description: string;
  icon?: string;
  wizardSchema: WizardSchema;
  /** Capacidades declaradas (ex.: ['execute:cliente.dados', 'health']). */
  capabilities: string[];
  /** Tipo do segredo criado pelo wizard (default API_KEY). */
  secretKind?: 'API_KEY' | 'OAUTH' | 'PASSWORD' | 'CERTIFICATE' | 'PRIVATE_KEY' | 'TOKEN' | 'OTHER';
  /**
   * Metrica de licenciamento contada POR CONEXAO deste provider (alem da
   * metrica estrutural 'connections'). Ex.: 'whatsapp_numbers' (diretriz 19).
   */
  countMetric?: string;
}

export interface ConnectResult {
  ok: boolean;
  detail?: string;
}

export interface HealthResult {
  ok: boolean;
  detail?: string;
  /** Checks individuais (ex.: { token: true, endpoint: true }). */
  checks?: Record<string, boolean>;
}

export interface DiscoveredResource {
  kind: string;
  id: string;
  name: string;
  meta?: Record<string, unknown>;
}

export interface DiscoveryResult {
  resources: DiscoveredResource[];
}

// ─── Contexto de execucao ───────────────────────────────────────────────

/**
 * Acesso controlado aos segredos da connection — injetado pelo Secrets
 * Manager. Providers NUNCA leem integration_secrets direto.
 */
/** Metadados OAuth persistidos no Secret (expires_at etc.) — nunca o refresh. */
export interface OAuthMeta {
  /** Epoch ms de expiracao do access token corrente. */
  expires_at?: number;
  /** E-mail/identidade da conta autenticada (informativo). */
  account?: string;
  scope?: string;
}

export interface SecretsAccessor {
  /** Valor decifrado de um campo secreto do wizard (null se ausente). */
  get(field: string): Promise<string | null>;
  /** Todos os campos secretos decifrados (uso interno do provider). */
  getAll(): Promise<Record<string, string>>;
  /** Metadados OAuth (nao-sensiveis) do Secret. */
  getOauthMeta(): Promise<OAuthMeta | null>;
  /**
   * Persiste novos tokens OAuth: cifra values (access/refresh) no encrypted_value
   * e grava oauth_meta. Usado pelo refresh automatico do provider.
   */
  updateOauth(values: Record<string, string>, meta: OAuthMeta): Promise<void>;
}

export interface ProviderContext {
  connection: Connection;
  secrets: SecretsAccessor;
  logger: Logger;
}

// ─── Interface unica (diretriz 2) ───────────────────────────────────────

export interface IProvider {
  metadata(): ProviderMetadata;
  /** Estabelece/valida a conexao apos o wizard (antes do 1o health). */
  connect(ctx: ProviderContext, config: Record<string, unknown>): Promise<ConnectResult>;
  /** Encerra sessoes/recursos remotos (connection NUNCA e apagada). */
  disconnect(ctx: ProviderContext): Promise<void>;
  /** Health check — alimenta last_health_at/last_health_ok/status. */
  health(ctx: ProviderContext): Promise<HealthResult>;
  /** Porta unica de operacoes do provider. */
  execute(ctx: ProviderContext, operation: string, params: unknown): Promise<unknown>;
  /** Recursos disponiveis (contas, numeros, tabelas, modelos...) — diretriz 24. */
  discover(ctx: ProviderContext): Promise<DiscoveryResult>;
}
