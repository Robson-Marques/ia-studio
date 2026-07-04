// Cliente HTTP do Google (OAuth2 + Gmail REST API v1) — sem SDK, so fetch via
// http.util. Funcoes puras; nenhum estado, nenhum acesso a banco. Usadas pelo
// GoogleWorkspaceProvider (troca de code, refresh de token e chamadas Gmail).
import { httpRequest } from './http.util';

const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const OAUTH_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';

// Escopos minimos: enviar, ler e modificar (labels) + e-mail da conta.
export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/userinfo.email',
];

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  token_type?: string;
}

/** Le a configuracao OAuth do Google das envs (nunca de config de conexao). */
export function readGoogleOAuthConfig(): GoogleOAuthConfig {
  const clientId = process.env['GOOGLE_CLIENT_ID'] ?? '';
  const clientSecret = process.env['GOOGLE_CLIENT_SECRET'] ?? '';
  const redirectUri = process.env['GOOGLE_OAUTH_REDIRECT'] ?? '';
  return { clientId, clientSecret, redirectUri };
}

/** Monta a URL de consentimento (state assinado vem de fora). */
export function buildConsentUrl(cfg: GoogleOAuthConfig, state: string, loginHint?: string): string {
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: 'code',
    scope: GOOGLE_SCOPES.join(' '),
    access_type: 'offline', // garante refresh_token
    prompt: 'consent', // força emissão de refresh_token mesmo em re-consentimento
    include_granted_scopes: 'true',
    state,
  });
  if (loginHint) params.set('login_hint', loginHint);
  return `${OAUTH_AUTH_URL}?${params.toString()}`;
}

/** Troca o authorization code por access+refresh token. */
export async function exchangeCode(cfg: GoogleOAuthConfig, code: string): Promise<GoogleTokenResponse> {
  return postForm(OAUTH_TOKEN_URL, {
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    redirect_uri: cfg.redirectUri,
    grant_type: 'authorization_code',
    code,
  });
}

/** Renova o access token a partir do refresh token. */
export async function refreshAccessToken(
  cfg: GoogleOAuthConfig,
  refreshToken: string,
): Promise<GoogleTokenResponse> {
  return postForm(OAUTH_TOKEN_URL, {
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
}

/** E-mail da conta autenticada (discover/health). */
export async function getUserEmail(accessToken: string): Promise<string | null> {
  const res = await httpRequest(USERINFO_URL, {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` },
    timeoutMs: 12_000,
  });
  const data = res.data as { email?: string } | null;
  return data?.email ?? null;
}

// ─── Gmail REST ──────────────────────────────────────────────

/** Envia uma mensagem MIME (base64url) via users/me/messages/send. */
export async function gmailSend(accessToken: string, rawBase64Url: string): Promise<unknown> {
  return gmailCall(accessToken, 'POST', '/messages/send', { raw: rawBase64Url });
}

export async function gmailListMessages(
  accessToken: string,
  query?: string,
  maxResults = 25,
): Promise<unknown> {
  const params = new URLSearchParams({ maxResults: String(maxResults) });
  if (query) params.set('q', query);
  return gmailCall(accessToken, 'GET', `/messages?${params.toString()}`);
}

export async function gmailGetMessage(accessToken: string, id: string): Promise<unknown> {
  return gmailCall(accessToken, 'GET', `/messages/${encodeURIComponent(id)}?format=full`);
}

export async function gmailListLabels(accessToken: string): Promise<unknown> {
  return gmailCall(accessToken, 'GET', '/labels');
}

export async function gmailListThreads(
  accessToken: string,
  query?: string,
  maxResults = 25,
): Promise<unknown> {
  const params = new URLSearchParams({ maxResults: String(maxResults) });
  if (query) params.set('q', query);
  return gmailCall(accessToken, 'GET', `/threads?${params.toString()}`);
}

// ─── Baixo nivel ─────────────────────────────────────────────

/** Chamada Gmail autenticada; lanca Error com detalhe em HTTP !=2xx. */
async function gmailCall(
  accessToken: string,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<unknown> {
  const res = await httpRequest(`${GMAIL_BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${accessToken}` },
    body,
    timeoutMs: 20_000,
  });
  if (res.status < 200 || res.status >= 300) {
    const detail = extractGoogleError(res.data) ?? `HTTP ${res.status}`;
    const err = new Error(`Gmail API (${path}): ${detail}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return res.data;
}

/** POST application/x-www-form-urlencoded (endpoints OAuth do Google). */
async function postForm(url: string, form: Record<string, string>): Promise<GoogleTokenResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form).toString(),
      signal: controller.signal,
    });
    const text = await response.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    if (!response.ok) {
      const detail = extractGoogleError(data) ?? `HTTP ${response.status}`;
      const err = new Error(`OAuth Google: ${detail}`) as Error & { status?: number };
      err.status = response.status;
      throw err;
    }
    return data as GoogleTokenResponse;
  } catch (e) {
    const err = e as Error;
    if (err.name === 'AbortError') throw new Error('Timeout ao chamar o OAuth do Google.');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function extractGoogleError(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const obj = data as { error?: unknown; error_description?: string; message?: string };
  if (typeof obj.error_description === 'string') return obj.error_description;
  if (obj.error && typeof obj.error === 'object') {
    const nested = obj.error as { message?: string };
    if (typeof nested.message === 'string') return nested.message;
  }
  if (typeof obj.error === 'string') return obj.error;
  if (typeof obj.message === 'string') return obj.message;
  return null;
}

/** Monta um e-mail MIME simples e o codifica em base64url (formato do Gmail). */
export function buildMimeBase64Url(input: {
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
}): string {
  const boundary = `iastudio_${Date.now().toString(36)}`;
  const headers: string[] = [
    `From: ${input.from}`,
    `To: ${input.to.join(', ')}`,
  ];
  if (input.cc?.length) headers.push(`Cc: ${input.cc.join(', ')}`);
  if (input.bcc?.length) headers.push(`Bcc: ${input.bcc.join(', ')}`);
  if (input.replyTo) headers.push(`Reply-To: ${input.replyTo}`);
  headers.push(`Subject: ${encodeMimeHeader(input.subject)}`);
  headers.push('MIME-Version: 1.0');

  let body: string;
  if (input.html && input.text) {
    headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    body =
      `--${boundary}\r\n` +
      `Content-Type: text/plain; charset="UTF-8"\r\n\r\n${input.text}\r\n\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: text/html; charset="UTF-8"\r\n\r\n${input.html}\r\n\r\n` +
      `--${boundary}--`;
  } else if (input.html) {
    headers.push('Content-Type: text/html; charset="UTF-8"');
    body = input.html;
  } else {
    headers.push('Content-Type: text/plain; charset="UTF-8"');
    body = input.text ?? '';
  }

  const mime = `${headers.join('\r\n')}\r\n\r\n${body}`;
  return Buffer.from(mime, 'utf-8').toString('base64url');
}

/** RFC 2047 (UTF-8 base64) para assuntos com acentos. */
function encodeMimeHeader(value: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, 'utf-8').toString('base64')}?=`;
}
