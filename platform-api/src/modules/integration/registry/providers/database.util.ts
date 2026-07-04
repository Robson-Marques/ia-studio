// Utilitarios comuns aos providers DATABASE (postgresql/sqlserver) — Fase 7.
// Schema Discovery (diretriz 24) + SQL read-only por default (diretriz 28).
// Drivers carregados via import tardio: ausentes → discover/execute retornam
// stub sem derrubar o boot nem exigir dep nova instalada.
import { BadRequestException } from '@nestjs/common';

export interface DbColumn {
  name: string;
  type: string;
}

export interface DbTable {
  schema: string;
  name: string;
  columns: DbColumn[];
}

export interface PgConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl: boolean;
}

// Comandos de escrita/DDL bloqueados no modo read-only por default. Escrita
// exige aprovacao/allowlist explicita (fora do escopo do Explorer/Console V1).
const WRITE_TOKENS = [
  'insert', 'update', 'delete', 'drop', 'alter', 'create', 'truncate',
  'grant', 'revoke', 'merge', 'call', 'exec', 'execute', 'replace',
  'comment', 'vacuum', 'copy', 'begin', 'commit', 'rollback',
];

/**
 * Garante que a consulta e read-only (SELECT/EXPLAIN/WITH/SHOW). Rejeita
 * multiplos statements (;) e qualquer token de escrita/DDL. Diretriz 28:
 * "SQL read-only por default; escrita bloqueada".
 */
export function assertReadOnlySql(sql: string): void {
  const trimmed = sql.trim().replace(/;+\s*$/, '');
  if (trimmed.includes(';')) {
    throw new BadRequestException('Apenas uma consulta por vez (sem “;” intermediário).');
  }
  const lower = trimmed.toLowerCase();
  const first = lower.split(/\s+/)[0] ?? '';
  const allowed = ['select', 'explain', 'with', 'show'];
  if (!allowed.includes(first)) {
    throw new BadRequestException(
      'Somente consultas de leitura (SELECT/EXPLAIN/WITH/SHOW) são permitidas — escrita bloqueada.',
    );
  }
  // Palavras de escrita em qualquer posicao (defesa extra contra CTE malicioso).
  for (const token of WRITE_TOKENS) {
    if (new RegExp(`\\b${token}\\b`, 'i').test(lower)) {
      throw new BadRequestException(`Comando "${token}" não permitido no modo somente leitura.`);
    }
  }
}

// ─── Drivers via import tardio (sem dep obrigatoria) ────────────────────

interface PgClientCtor {
  new (config: Record<string, unknown>): {
    connect(): Promise<void>;
    query(sql: string): Promise<{ rows: unknown[]; rowCount: number | null }>;
    end(): Promise<void>;
  };
}

export function loadPgDriver(): { Client: PgClientCtor } | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('pg') as { Client: PgClientCtor };
  } catch {
    return null;
  }
}

interface MssqlModule {
  connect(config: Record<string, unknown>): Promise<{
    request(): { query(sql: string): Promise<{ recordset: unknown[] }> };
    close(): Promise<void>;
  }>;
}

export function loadMssqlDriver(): MssqlModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('mssql') as MssqlModule;
  } catch {
    return null;
  }
}
