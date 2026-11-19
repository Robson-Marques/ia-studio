// Memory Service — read/write escopado por scope_key com TTL e max_items.
// Escopos (AiMemoryScope): SESSION/CONTACT/WORKFLOW/AGENT. O AgentRunner e as
// tools memory_read/memory_write chamam readFor/writeFor.
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AiMemoryProfile, Prisma } from '@prisma/client';
import { MemoryRepository } from './memory.repository';
import { AuditLogService } from '../../../shared/audit/audit-log.service';
import { CreateMemoryProfileDto, UpdateMemoryProfileDto } from './dto/memory.dtos';

export interface MemoryReadResult {
  key: string;
  value: unknown;
  expires_at: Date | null;
  updated_at: Date;
}

@Injectable()
export class MemoryService {
  private readonly logger = new Logger(MemoryService.name);

  constructor(
    private readonly repository: MemoryRepository,
    private readonly audit: AuditLogService,
  ) {}

  // ─── Perfis (CRUD) ──────────────────────────────────

  findProfiles() {
    return this.repository.findProfiles();
  }

  async findProfile(id: string): Promise<AiMemoryProfile> {
    const profile = await this.repository.findProfileById(id);
    if (!profile) throw new NotFoundException('Perfil de memória não encontrado.');
    return profile;
  }

  async createProfile(dto: CreateMemoryProfileDto, createdBy: string | null) {
    const profile = await this.repository.createProfile({
      name: dto.name,
      scope: dto.scope,
      description: dto.description,
      max_items: dto.max_items,
      default_ttl_seconds: dto.default_ttl_seconds,
      created_by: createdBy,
    } as Prisma.AiMemoryProfileUncheckedCreateInput);
    await this.audit.record({
      action: 'ai.memory.profile.create',
      entityType: 'AiMemoryProfile',
      entityId: profile.id,
      newValue: { name: profile.name, scope: profile.scope },
    });
    return profile;
  }

  async updateProfile(id: string, dto: UpdateMemoryProfileDto) {
    const before = await this.findProfile(id);
    const data: Prisma.AiMemoryProfileUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.max_items !== undefined) data.max_items = dto.max_items;
    if (dto.default_ttl_seconds !== undefined) data.default_ttl_seconds = dto.default_ttl_seconds;
    if (dto.is_active !== undefined) data.is_active = dto.is_active;
    const profile = await this.repository.updateProfile(id, data);
    await this.audit.record({
      action: 'ai.memory.profile.update',
      entityType: 'AiMemoryProfile',
      entityId: id,
      oldValue: { name: before.name, is_active: before.is_active },
      newValue: { name: profile.name, is_active: profile.is_active },
    });
    return profile;
  }

  // ─── Entradas (navegacao read-only pelo painel) ─────

  async listEntries(profileId: string, scopeKey?: string) {
    await this.findProfile(profileId);
    const now = new Date();
    const rows = await this.repository.findEntries(profileId, scopeKey);
    return rows.filter((r) => !r.expires_at || r.expires_at > now);
  }

  // ─── Porta usada pelo runner/tools ──────────────────

  /** Le todas as entradas vivas de um escopo (para injetar no prompt). */
  async readFor(profile: AiMemoryProfile, scopeKey: string): Promise<MemoryReadResult[]> {
    const now = new Date();
    await this.repository.deleteExpired(profile.id, scopeKey, now).catch(() => undefined);
    const rows = await this.repository.findEntries(profile.id, scopeKey);
    return rows
      .filter((r) => !r.expires_at || r.expires_at > now)
      .map((r) => ({ key: r.key, value: r.value, expires_at: r.expires_at, updated_at: r.updated_at }));
  }

  /** Le uma chave especifica. */
  async readKey(profile: AiMemoryProfile, scopeKey: string, key: string): Promise<unknown> {
    const entry = await this.repository.findEntry(profile.id, scopeKey, key);
    if (!entry) return null;
    if (entry.expires_at && entry.expires_at <= new Date()) return null;
    return entry.value;
  }

  /** Escreve/atualiza uma chave (respeita TTL e max_items). */
  async writeKey(
    profile: AiMemoryProfile,
    scopeKey: string,
    key: string,
    value: unknown,
    ttlSeconds?: number,
  ): Promise<void> {
    const ttl = ttlSeconds ?? profile.default_ttl_seconds ?? undefined;
    const expiresAt = ttl ? new Date(Date.now() + ttl * 1000) : null;
    await this.repository.upsertEntry({
      profile_id: profile.id,
      scope_key: scopeKey,
      key,
      value: (value ?? null) as Prisma.InputJsonValue,
      expires_at: expiresAt,
    });
    // Poda por max_items (remove as mais antigas).
    if (profile.max_items && profile.max_items > 0) {
      const count = await this.repository.countEntries(profile.id, scopeKey);
      if (count > profile.max_items) {
        const excess = await this.repository.oldestEntries(profile.id, scopeKey, count - profile.max_items);
        for (const old of excess) {
          await this.repository.deleteEntry(old.id).catch(() => undefined);
        }
      }
    }
  }
}
