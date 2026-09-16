// Developer Center / API Keys (Fase 7 — diretriz 57). A chave em claro so
// existe no momento da criacao (retornada 1x). Persistimos prefixo (exibicao)
// + hash SHA-256 (lookup unico). Revogar = mudar de estado (revoked_at) —
// NUNCA deleta. Autenticacao da Public API resolvida por hash em `authenticate`.
import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { DeveloperApiKey } from '@prisma/client';
import { DeveloperRepository } from './developer.repository';
import { CreateApiKeyDto } from './dto/developer.dtos';

/** Metadados publicos de uma chave (sem o hash). */
export interface ApiKeyView {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  last_used_at: Date | null;
  expires_at: Date | null;
  revoked_at: Date | null;
  created_at: Date;
}

/** Contexto resolvido para a Public API (request.apiKey). */
export interface ApiKeyContext {
  key_id: string;
  scopes: string[];
}

@Injectable()
export class DeveloperService {
  private readonly logger = new Logger(DeveloperService.name);

  constructor(private readonly repo: DeveloperRepository) {}

  private static hash(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  private static toView(key: DeveloperApiKey): ApiKeyView {
    return {
      id: key.id,
      name: key.name,
      prefix: key.prefix,
      scopes: key.scopes,
      last_used_at: key.last_used_at,
      expires_at: key.expires_at,
      revoked_at: key.revoked_at,
      created_at: key.created_at,
    };
  }

  async list(): Promise<ApiKeyView[]> {
    const keys = await this.repo.findAll();
    return keys.map((k) => DeveloperService.toView(k));
  }

  /**
   * Cria a chave. Retorna a view + o segredo em claro UMA vez (`plaintext`).
   * Formato: `ias_<prefix8>_<random32>`.
   */
  async create(
    dto: CreateApiKeyDto,
    createdBy: string | null,
  ): Promise<{ key: ApiKeyView; plaintext: string }> {
    const prefix = randomBytes(4).toString('hex'); // 8 chars
    const secret = randomBytes(24).toString('base64url'); // 32 chars
    const plaintext = `ias_${prefix}_${secret}`;
    const created = await this.repo.create({
      name: dto.name.trim(),
      prefix,
      hashed_key: DeveloperService.hash(plaintext),
      scopes: dto.scopes ?? [],
      expires_at: dto.expires_at ? new Date(dto.expires_at) : null,
      created_by: createdBy,
    });
    this.logger.log(`Chave de API criada (prefix=${prefix}).`);
    return { key: DeveloperService.toView(created), plaintext };
  }

  async revoke(id: string): Promise<ApiKeyView> {
    const key = await this.repo.findById(id);
    if (!key) {
      throw new NotFoundException('Chave de API não encontrada.');
    }
    if (key.revoked_at) return DeveloperService.toView(key);
    const updated = await this.repo.update(id, { revoked_at: new Date() });
    return DeveloperService.toView(updated);
  }

  /**
   * Autentica um segredo em claro (Public API). Lanca 403 se ausente, revogado
   * ou expirado. Best-effort `touch` de last_used_at.
   */
  async authenticate(rawKey: string): Promise<ApiKeyContext> {
    const key = await this.repo.findByHash(DeveloperService.hash(rawKey));
    if (!key) throw new ForbiddenException('Chave de API inválida.');
    if (key.revoked_at) throw new ForbiddenException('Chave de API revogada.');
    if (key.expires_at && key.expires_at.getTime() < Date.now()) {
      throw new ForbiddenException('Chave de API expirada.');
    }
    void this.repo.touch(key.id);
    return { key_id: key.id, scopes: key.scopes };
  }
}
