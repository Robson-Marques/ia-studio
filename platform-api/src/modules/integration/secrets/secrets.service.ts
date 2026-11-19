// Secrets Manager (diretriz 5). O valor cifrado guarda um MAPA de campos
// secretos do wizard como JSON ("{ api_key: '...' }") em AES-256-GCM.
//
// REGRA DE OURO: getDecrypted*/accessorFor sao INTERNOS — nunca expostos
// via HTTP. Endpoints listam apenas metadados (toView remove encrypted_value).
import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, Secret, SecretKind } from '@prisma/client';
import { SecretsRepository } from './secrets.repository';
import { AuditLogService } from '../../../shared/audit/audit-log.service';
import { decrypt, encrypt } from '../../../shared/crypto/crypto.util';
import { OAuthMeta, SecretsAccessor } from '../../../shared/integration/provider.interface';

export interface SecretView {
  id: string;
  name: string;
  kind: SecretKind;
  fields: string[];
  rotated_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateSecretInput {
  name: string;
  kind: SecretKind;
  /** Campo → valor em claro (cifrado aqui dentro, nunca persiste em claro). */
  values: Record<string, string>;
  createdBy?: string | null;
}

@Injectable()
export class SecretsService {
  private readonly logger = new Logger(SecretsService.name);

  constructor(
    private readonly repository: SecretsRepository,
    private readonly audit: AuditLogService,
  ) {}

  // ─── Leitura (metadados apenas) ─────────────────────
  async findAll(): Promise<SecretView[]> {
    const rows = await this.repository.findAll();
    return rows.map((row) => this.toView(row));
  }

  async findViewById(id: string): Promise<SecretView> {
    const row = await this.getById(id);
    return this.toView(row);
  }

  // ─── Escrita ────────────────────────────────────────
  async create(input: CreateSecretInput): Promise<SecretView> {
    const row = await this.repository.create({
      name: input.name,
      kind: input.kind,
      encryptedValue: encrypt(JSON.stringify(input.values)),
      createdBy: input.createdBy,
    });
    await this.audit.record({
      action: 'integration.secret.create',
      entityType: 'Secret',
      entityId: row.id,
      newValue: { name: row.name, kind: row.kind, fields: Object.keys(input.values) },
    });
    return this.toView(row);
  }

  /**
   * Merge de campos: sobrescreve APENAS as chaves informadas (mantem as
   * demais). Uso interno da edicao de conexao — chave nao enviada continua
   * como esta. Marca rotated_at (o valor cifrado mudou). Sem audit de rotacao
   * manual (a auditoria fica na conexao que chamou).
   */
  async mergeValues(secretId: string, values: Record<string, string>): Promise<void> {
    if (!Object.keys(values).length) return;
    const current = await this.getDecryptedMap(secretId);
    const merged = { ...current, ...values };
    await this.repository.rotate(secretId, encrypt(JSON.stringify(merged)));
  }

  /** Rotacao: substitui o valor cifrado inteiro e marca rotated_at. */
  async rotate(id: string, values: Record<string, string>): Promise<SecretView> {
    const before = await this.getById(id);
    if (!Object.keys(values).length) {
      throw new ConflictException('Informe ao menos um campo para rotacionar o segredo.');
    }
    const row = await this.repository.rotate(id, encrypt(JSON.stringify(values)));
    await this.audit.record({
      action: 'integration.secret.rotate',
      entityType: 'Secret',
      entityId: id,
      oldValue: { rotated_at: before.rotated_at },
      newValue: { rotated_at: row.rotated_at, fields: Object.keys(values) },
    });
    return this.toView(row);
  }

  // ─── Acesso interno (NUNCA via HTTP) ────────────────

  /** Mapa decifrado de campos do segredo — uso interno de providers/drivers. */
  async getDecryptedMap(secretId: string): Promise<Record<string, string>> {
    const row = await this.repository.findById(secretId);
    if (!row) throw new NotFoundException('Segredo não encontrado.');
    return this.parseMap(row);
  }

  /** Metadados OAuth (nao-sensiveis) do segredo — uso interno. */
  async getOauthMeta(secretId: string): Promise<OAuthMeta | null> {
    const row = await this.repository.findById(secretId);
    if (!row) throw new NotFoundException('Segredo não encontrado.');
    if (!row.oauth_meta || typeof row.oauth_meta !== 'object') return null;
    return row.oauth_meta as unknown as OAuthMeta;
  }

  /**
   * Atualiza tokens OAuth: cifra o mapa completo (access + refresh) e grava
   * oauth_meta. Usado pelo callback OAuth e pelo refresh automatico do provider.
   * NAO gera audit de rotacao manual (é operacao de sistema, alto volume).
   */
  async updateOauth(secretId: string, values: Record<string, string>, meta: OAuthMeta): Promise<void> {
    await this.repository.updateOauth(
      secretId,
      encrypt(JSON.stringify(values)),
      meta as unknown as Prisma.InputJsonValue,
    );
  }

  /** SecretsAccessor injetado nos providers (ctx.secrets). */
  accessorFor(secretId: string | null): SecretsAccessor {
    return {
      get: async (field: string): Promise<string | null> => {
        if (!secretId) return null;
        const map = await this.getDecryptedMap(secretId);
        return map[field] ?? null;
      },
      getAll: async (): Promise<Record<string, string>> => {
        if (!secretId) return {};
        return this.getDecryptedMap(secretId);
      },
      getOauthMeta: async (): Promise<OAuthMeta | null> => {
        if (!secretId) return null;
        return this.getOauthMeta(secretId);
      },
      updateOauth: async (values: Record<string, string>, meta: OAuthMeta): Promise<void> => {
        if (!secretId) return;
        await this.updateOauth(secretId, values, meta);
      },
    };
  }

  // ─── Helpers ────────────────────────────────────────
  private async getById(id: string): Promise<Secret> {
    const row = await this.repository.findById(id);
    if (!row) throw new NotFoundException('Segredo não encontrado.');
    return row;
  }

  private parseMap(row: Secret): Record<string, string> {
    // decrypt LANÇA se o valor está cifrado mas a auth tag não bate (ENCRYPTION_KEY
    // divergente após restore/migração, ou dado corrompido). NÃO engolir pra {}:
    // o mergeValues parte deste mapa e, com {}, sobrescreveria o segredo apagando
    // os campos. Propaga → a operação aborta e o erro fica visível (regra do
    // projeto: nunca catch que engole e devolve fallback sem sinal).
    const raw = decrypt(row.encrypted_value);
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      // Decifrou mas não é JSON (valor legado em claro) — trata como vazio.
      return {};
    }
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'string') out[k] = v;
    }
    return out;
  }

  /** View sem encrypted_value — expoe so os NOMES dos campos. */
  private toView(row: Secret): SecretView {
    let fields: string[] = [];
    try {
      fields = Object.keys(JSON.parse(decrypt(row.encrypted_value)) as Record<string, unknown>);
    } catch (e) {
      // Só a VIEW (nomes de campos) tolera falha, mas com SINAL — não silencioso.
      fields = [];
      this.logger.warn(
        `Não foi possível decifrar o segredo ${row.id} (ENCRYPTION_KEY divergente após restore/migração?): ${(e as Error).message}`,
      );
    }
    return {
      id: row.id,
      name: row.name,
      kind: row.kind,
      fields,
      rotated_at: row.rotated_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}
