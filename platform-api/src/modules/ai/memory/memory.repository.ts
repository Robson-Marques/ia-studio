// Porta unica ao banco de memoria (ai_memory_profiles / ai_memory_entries).
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';

@Injectable()
export class MemoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Perfis ─────────────────────────────────────────

  findProfiles(organizationId: string, filters: { workspaceId?: string; environmentId?: string } = {}) {
    const where: Prisma.AiMemoryProfileWhereInput = { organization_id: organizationId };
    if (filters.workspaceId) where.workspace_id = filters.workspaceId;
    if (filters.environmentId) where.environment_id = filters.environmentId;
    return this.prisma.aiMemoryProfile.findMany({ where, orderBy: { created_at: 'desc' } });
  }

  findProfileById(id: string) {
    return this.prisma.aiMemoryProfile.findUnique({ where: { id } });
  }

  createProfile(data: Prisma.AiMemoryProfileUncheckedCreateInput) {
    return this.prisma.aiMemoryProfile.create({ data });
  }

  updateProfile(id: string, data: Prisma.AiMemoryProfileUpdateInput) {
    return this.prisma.aiMemoryProfile.update({ where: { id }, data });
  }

  // ─── Entradas ───────────────────────────────────────

  findEntries(profileId: string, scopeKey?: string) {
    const where: Prisma.AiMemoryEntryWhereInput = { profile_id: profileId };
    if (scopeKey) where.scope_key = scopeKey;
    return this.prisma.aiMemoryEntry.findMany({ where, orderBy: { updated_at: 'desc' } });
  }

  findEntry(profileId: string, scopeKey: string, key: string) {
    return this.prisma.aiMemoryEntry.findUnique({
      where: { profile_id_scope_key_key: { profile_id: profileId, scope_key: scopeKey, key } },
    });
  }

  countEntries(profileId: string, scopeKey: string) {
    return this.prisma.aiMemoryEntry.count({ where: { profile_id: profileId, scope_key: scopeKey } });
  }

  upsertEntry(data: {
    profile_id: string;
    organization_id: string;
    scope_key: string;
    key: string;
    value: Prisma.InputJsonValue;
    expires_at: Date | null;
  }) {
    return this.prisma.aiMemoryEntry.upsert({
      where: {
        profile_id_scope_key_key: {
          profile_id: data.profile_id,
          scope_key: data.scope_key,
          key: data.key,
        },
      },
      create: data,
      update: { value: data.value, expires_at: data.expires_at },
    });
  }

  deleteEntry(id: string) {
    return this.prisma.aiMemoryEntry.delete({ where: { id } });
  }

  deleteExpired(profileId: string, scopeKey: string, now: Date) {
    return this.prisma.aiMemoryEntry.deleteMany({
      where: { profile_id: profileId, scope_key: scopeKey, expires_at: { lt: now } },
    });
  }

  oldestEntries(profileId: string, scopeKey: string, take: number) {
    return this.prisma.aiMemoryEntry.findMany({
      where: { profile_id: profileId, scope_key: scopeKey },
      orderBy: { updated_at: 'asc' },
      take,
    });
  }
}
