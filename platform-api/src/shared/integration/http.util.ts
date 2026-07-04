// Helper HTTP dos providers — fetch nativo (Node 20) com timeout via
// AbortController. Funcoes puras; nenhum estado.

export interface HttpRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
}

export interface HttpResult {
  status: number;
  ok: boolean;
  /** Corpo parseado como JSON quando possivel; senao texto cru. */
  data: unknown;
}

const DEFAULT_TIMEOUT_MS = 15_000;

/** Requisicao HTTP com timeout. Lanca Error em falha de rede/timeout. */
export async function httpRequest(url: string, options: HttpRequestOptions = {}): Promise<HttpResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: options.method ?? 'GET',
      headers: {
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers ?? {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
    const text = await response.text();
    let data: unknown = text;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      // corpo nao-JSON — mantem texto
    }
    return { status: response.status, ok: response.ok, data };
  } catch (e) {
    const err = e as Error;
    if (err.name === 'AbortError') {
      throw new Error(`Timeout ao chamar ${url}`);
    }
    throw new Error(`Falha de rede ao chamar ${url}: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
}

/** Teste de socket TCP (host:porta) — usado por providers de banco/SMTP. */
export function tcpProbe(host: string, port: number, timeoutMs = 5_000): Promise<boolean> {
  return new Promise((resolve) => {
    // Import tardio: modulo nativo, sem dependencia nova.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const net = require('net') as typeof import('net');
    const socket = new net.Socket();
    const done = (ok: boolean) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
    socket.connect(port, host);
  });
}
