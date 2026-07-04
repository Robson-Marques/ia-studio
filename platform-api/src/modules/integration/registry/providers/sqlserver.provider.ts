// Provider SQL Server (Microsoft) — Fase 7 (diretriz 24). Health por socket TCP;
// discover() lista tabelas/colunas/tipos; execute('sql.query') roda SQL
// READ-ONLY. Driver `mssql` via import tardio: ausente → stub (sem dep nova).
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
import { assertReadOnlySql, DbColumn, DbTable, loadMssqlDriver } from './database.util';

@Injectable()
export class SqlServerProvider extends BaseProvider {
  metadata(): ProviderMetadata {
    return {
      key: 'sqlserver',
      name: 'SQL Server',
      category: ProviderCategory.DATABASE,
      description: 'Microsoft SQL Server — schema discovery e consultas read-only.',
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
              { key: 'host', label: 'Host', type: 'text', required: true, placeholder: 'sql.exemplo.com' },
              { key: 'port', label: 'Porta', type: 'number', required: true, default: 1433 },
              { key: 'database', label: 'Banco de dados', type: 'text', required: true },
              { key: 'encrypt', label: 'Criptografia (TLS)', type: 'select', default: 'true', options: [
                { value: 'true', label: 'Sim' },
                { value: 'false', label: 'Não' },
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
        assertReadOnlySql(sql);
        return this.runQuery(ctx, sql);
      }
      case 'schema.tables':
        return { tables: await this.discoverTables(ctx) };
      default:
        throw new BadRequestException(
          `Operação "${operation}" não suportada pelo SQL Server. Disponíveis: sql.query, schema.tables.`,
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
    const rows = await this.query(
      ctx,
      `SELECT TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, DATA_TYPE
         FROM INFORMATION_SCHEMA.COLUMNS
        ORDER BY TABLE_SCHEMA, TABLE_NAME, ORDINAL_POSITION`,
    );
    if (!rows) return [];
    const byTable = new Map<string, DbTable>();
    for (const raw of rows as Array<Record<string, string>>) {
      const key = `${raw['TABLE_SCHEMA']}.${raw['TABLE_NAME']}`;
      let t = byTable.get(key);
      if (!t) {
        t = { schema: raw['TABLE_SCHEMA'], name: raw['TABLE_NAME'], columns: [] };
        byTable.set(key, t);
      }
      const col: DbColumn = { name: raw['COLUMN_NAME'], type: raw['DATA_TYPE'] };
      t.columns.push(col);
    }
    return Array.from(byTable.values());
  }

  private async runQuery(ctx: ProviderContext, sql: string): Promise<{ rows: unknown[]; row_count: number }> {
    const rows = await this.query(ctx, sql);
    if (rows === null) {
      throw new BadRequestException('Driver "mssql" ausente no runtime — consulta indisponível (stub).');
    }
    const limited = rows.slice(0, 500);
    return { rows: limited, row_count: rows.length };
  }

  /** Executa a consulta; null quando o driver esta ausente (stub). */
  private async query(ctx: ProviderContext, sql: string): Promise<unknown[] | null> {
    const driver = loadMssqlDriver();
    if (!driver) {
      ctx.logger.warn('Driver "mssql" ausente — SQL Server indisponível (instale a dep para leitura real).');
      return null;
    }
    const cfg = this.configOf(ctx);
    const username = (await ctx.secrets.get('username')) ?? '';
    const password = (await ctx.secrets.get('password')) ?? '';
    if (!cfg.host || !cfg.database) {
      throw new BadRequestException('Conexão SQL Server sem host/database configurados.');
    }
    let pool: Awaited<ReturnType<typeof driver.connect>> | null = null;
    try {
      pool = await driver.connect({
        server: cfg.host,
        port: cfg.port,
        database: cfg.database,
        user: username,
        password,
        options: { encrypt: cfg.encrypt, trustServerCertificate: true },
        connectionTimeout: 8000,
        requestTimeout: 20000,
      });
      const result = await pool.request().query(sql);
      return result.recordset ?? [];
    } catch (e) {
      throw new BadRequestException(`Consulta SQL Server falhou: ${(e as Error).message}`);
    } finally {
      if (pool) await pool.close().catch(() => undefined);
    }
  }

  private configOf(ctx: ProviderContext): { host: string; port: number; database: string; encrypt: boolean } {
    const config = (ctx.connection.config ?? {}) as Record<string, unknown>;
    return {
      host: typeof config['host'] === 'string' ? (config['host'] as string) : '',
      port: Number(config['port'] ?? 1433),
      database: typeof config['database'] === 'string' ? (config['database'] as string) : '',
      encrypt: String(config['encrypt'] ?? 'true') === 'true',
    };
  }
}
