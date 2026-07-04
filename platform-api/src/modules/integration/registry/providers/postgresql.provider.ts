// Provider PostgreSQL — health por socket TCP (sem driver pg dedicado ainda).
// Fase 7 (diretriz 24 — Schema Discovery): discover() lista tabelas/colunas/tipos
// e execute('sql.query') roda SQL READ-ONLY. Sem dep nova: o driver `pg` e
// carregado via import tardio SE presente no runtime; ausente → resposta
// estruturada indicando indisponibilidade (stub), sem derrubar a UI.
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
import { tcpProbe } from '../../../../shared/integration/http.util';
import {
  assertReadOnlySql,
  DbColumn,
  DbTable,
  loadPgDriver,
  PgConfig,
} from './database.util';

@Injectable()
export class PostgresqlProvider extends BaseProvider {
  metadata(): ProviderMetadata {
    return {
      key: 'postgresql',
      name: 'PostgreSQL',
      category: ProviderCategory.DATABASE,
      description: 'Banco de dados PostgreSQL — schema discovery e consultas read-only.',
      icon: 'database',
      secretKind: 'PASSWORD',
      capabilities: ['health', 'discover', 'execute:sql.query', 'execute:schema.tables'],
      wizardSchema: {
        testable: true,
        steps: [
          {
            id: 'server',
            title: 'Servidor',
            fields: [
              { key: 'host', label: 'Host', type: 'text', required: true, placeholder: 'db.exemplo.com' },
              { key: 'port', label: 'Porta', type: 'number', required: true, default: 5432 },
              { key: 'database', label: 'Banco de dados', type: 'text', required: true },
              { key: 'ssl', label: 'SSL', type: 'select', default: 'false', options: [
                { value: 'false', label: 'Não' },
                { value: 'true', label: 'Sim' },
              ] },
            ],
          },
          {
            id: 'credentials',
            title: 'Credenciais',
            description: 'Usuário e senha ficam no Cofre de Segredos.',
            fields: [
              { key: 'username', label: 'Usuário', type: 'text', secret: true, required: true },
              { key: 'password', label: 'Senha', type: 'password', secret: true, required: true },
            ],
          },
        ],
      },
    };
  }

  async health(ctx: ProviderContext): Promise<HealthResult> {
    const cfg = this.configOf(ctx);
    if (!cfg.host) return { ok: false, detail: 'Conexão sem host configurado.' };
    const reachable = await tcpProbe(cfg.host, cfg.port);
    return reachable
      ? { ok: true, detail: `Servidor alcançável em ${cfg.host}:${cfg.port} (teste de socket).`, checks: { socket: true } }
      : { ok: false, detail: `Não foi possível conectar em ${cfg.host}:${cfg.port}.`, checks: { socket: false } };
  }

  async execute(ctx: ProviderContext, operation: string, params: unknown): Promise<unknown> {
    const p = (params && typeof params === 'object' ? params : {}) as Record<string, unknown>;
    switch (operation) {
      case 'sql.query': {
        const sql = typeof p['sql'] === 'string' ? (p['sql'] as string) : '';
        if (!sql.trim()) throw new BadRequestException('Informe a consulta SQL em "sql".');
        // SQL read-only por default (diretriz 28): SELECT/EXPLAIN/WITH somente.
        assertReadOnlySql(sql);
        return this.runQuery(ctx, sql);
      }
      case 'schema.tables':
        return { tables: await this.discoverTables(ctx) };
      default:
        throw new BadRequestException(
          `Operação "${operation}" não suportada pelo PostgreSQL. Disponíveis: sql.query, schema.tables.`,
        );
    }
  }

  async discover(ctx: ProviderContext): Promise<DiscoveryResult> {
    const tables = await this.discoverTables(ctx);
    const resources: DiscoveredResource[] = tables.map((t) => ({
      kind: 'table',
      id: `${t.schema}.${t.name}`,
      name: t.name,
      meta: { schema: t.schema, columns: t.columns },
    }));
    return { resources };
  }

  // ─── Helpers ────────────────────────────────────────

  private async discoverTables(ctx: ProviderContext): Promise<DbTable[]> {
    const cfg = await this.pgConfig(ctx);
    const driver = loadPgDriver();
    if (!driver) {
      // Stub: driver ausente no runtime. Nao derruba a UI — indica caminho.
      ctx.logger.warn('Driver "pg" ausente — schema discovery indisponível (instale a dep para leitura real).');
      return [];
    }
    const client = new driver.Client({
      host: cfg.host, port: cfg.port, database: cfg.database,
      user: cfg.username, password: cfg.password, ssl: cfg.ssl ? { rejectUnauthorized: false } : undefined,
      connectionTimeoutMillis: 8000, query_timeout: 12000,
    });
    try {
      await client.connect();
      const res = await client.query(
        `SELECT table_schema, table_name, column_name, data_type
           FROM information_schema.columns
          WHERE table_schema NOT IN ('pg_catalog','information_schema')
          ORDER BY table_schema, table_name, ordinal_position`,
      );
      const byTable = new Map<string, DbTable>();
      for (const row of res.rows as Array<Record<string, string>>) {
        const key = `${row['table_schema']}.${row['table_name']}`;
        let t = byTable.get(key);
        if (!t) {
          t = { schema: row['table_schema'], name: row['table_name'], columns: [] };
          byTable.set(key, t);
        }
        const col: DbColumn = { name: row['column_name'], type: row['data_type'] };
        t.columns.push(col);
      }
      return Array.from(byTable.values());
    } catch (e) {
      throw new BadRequestException(`Schema discovery PostgreSQL falhou: ${(e as Error).message}`);
    } finally {
      await client.end().catch(() => undefined);
    }
  }

  private async runQuery(ctx: ProviderContext, sql: string): Promise<{ rows: unknown[]; row_count: number }> {
    const cfg = await this.pgConfig(ctx);
    const driver = loadPgDriver();
    if (!driver) {
      throw new BadRequestException('Driver "pg" ausente no runtime — consulta indisponível (stub).');
    }
    const client = new driver.Client({
      host: cfg.host, port: cfg.port, database: cfg.database,
      user: cfg.username, password: cfg.password, ssl: cfg.ssl ? { rejectUnauthorized: false } : undefined,
      connectionTimeoutMillis: 8000, query_timeout: 20000,
    });
    try {
      await client.connect();
      const res = await client.query(sql);
      return { rows: res.rows.slice(0, 500), row_count: res.rowCount ?? res.rows.length };
    } catch (e) {
      throw new BadRequestException(`Consulta PostgreSQL falhou: ${(e as Error).message}`);
    } finally {
      await client.end().catch(() => undefined);
    }
  }

  private configOf(ctx: ProviderContext): { host: string; port: number; database: string; ssl: boolean } {
    const config = (ctx.connection.config ?? {}) as Record<string, unknown>;
    return {
      host: typeof config['host'] === 'string' ? (config['host'] as string) : '',
      port: Number(config['port'] ?? 5432),
      database: typeof config['database'] === 'string' ? (config['database'] as string) : '',
      ssl: String(config['ssl'] ?? 'false') === 'true',
    };
  }

  private async pgConfig(ctx: ProviderContext): Promise<PgConfig> {
    const base = this.configOf(ctx);
    if (!base.host || !base.database) {
      throw new BadRequestException('Conexão PostgreSQL sem host/database configurados.');
    }
    const username = (await ctx.secrets.get('username')) ?? '';
    const password = (await ctx.secrets.get('password')) ?? '';
    return { ...base, username, password };
  }
}
