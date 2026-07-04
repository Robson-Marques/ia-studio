// Feature Flags (diretriz 6): flag global + overrides segmentados.
// Precedencia da avaliacao: user > profile > workspace > org > flag global.
// Flag expirada (expires_at < agora) avalia como DESABILITADA.
// Cache em memoria 30s (avaliacao em runtime nao pode custar query por request).
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FeatureFlag, FeatureFlagOverride } from '@prisma/client';
import { FlagsRepository } from './flags.repository';
import { AuditLogService } from '../../../shared/audit/audit-log.service';
import { CreateFlagDto } from './dto/create-flag.dto';
import { UpdateFlagDto } from './dto/update-flag.dto';
import { CreateOverrideDto } from './dto/create-override.dto';

export interface FlagContext {
  organizationId?: string | null;
  workspaceId?: string | null;
  userId?: string | null;
  profileId?: string | null;
}

type FlagWithOverrides = FeatureFlag & { overrides: FeatureFlagOverride[] };

@Injectable()
export class FeatureFlagsService {
  private cache: { flags: FlagWithOverrides[]; expiresAt: number } | null = null;
  private readonly CACHE_TTL_MS = 30_000;

  constructor(
    private readonly repository: FlagsRepository,
    private readonly audit: AuditLogService,
  ) {}

  // ─── CRUD (Console) ─────────────────────────────────
  findAll() {
    return this.repository.findAll();
  }

  async findById(id: string) {
    const flag = await this.repository.findById(id);
    if (!flag) throw new NotFoundException('Flag não encontrada.');
    return flag;
  }

  async create(dto: CreateFlagDto) {
    const dup = await this.repository.findByKey(dto.key);
    if (dup) throw new ConflictException('Já existe uma flag com esta chave.');
    const flag = await this.repository.create({
      key: dto.key,
      description: dto.description ?? null,
      enabled: dto.enabled ?? false, // automatismo nasce OFF
      expires_at: dto.expires_at ? new Date(dto.expires_at) : null,
    });
    this.invalidateCache();
    await this.audit.record({
      action: 'core.flag.create',
      entityType: 'FeatureFlag',
      entityId: flag.id,
      newValue: { key: flag.key, enabled: flag.enabled, expires_at: flag.expires_at },
    });
    return flag;
  }

  async update(id: string, dto: UpdateFlagDto) {
    const before = await this.findById(id);
    const flag = await this.repository.update(id, {
      ...(dto.description !== undefined ? { description: dto.description } : {}),
      ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
      ...(dto.expires_at !== undefined ? { expires_at: new Date(dto.expires_at) } : {}),
    });
    this.invalidateCache();
    await this.audit.record({
      action: 'core.flag.update',
      entityType: 'FeatureFlag',
      entityId: id,
      oldValue: { enabled: before.enabled, expires_at: before.expires_at, description: before.description },
      newValue: { enabled: flag.enabled, expires_at: flag.expires_at, description: flag.description },
    });
    return flag;
  }

  async addOverride(flagId: string, dto: CreateOverrideDto) {
    await this.findById(flagId);
    if (!dto.organization_id && !dto.workspace_id && !dto.user_id && !dto.profile_id) {
      throw new BadRequestException(
        'Informe pelo menos um alvo (organization_id, workspace_id, user_id ou profile_id).',
      );
    }
    const override = await this.repository.createOverride({
      flag: { connect: { id: flagId } },
      organization_id: dto.organization_id ?? null,
      workspace_id: dto.workspace_id ?? null,
      user_id: dto.user_id ?? null,
      profile_id: dto.profile_id ?? null,
      enabled: dto.enabled,
    });
    this.invalidateCache();
    await this.audit.record({
      action: 'core.flag.override_create',
      entityType: 'FeatureFlagOverride',
      entityId: override.id,
      newValue: override,
    });
    return override;
  }

  async removeOverride(flagId: string, overrideId: string) {
    const override = await this.repository.findOverrideById(overrideId);
    if (!override || override.flag_id !== flagId) {
      throw new NotFoundException('Override não encontrado.');
    }
    await this.repository.deleteOverride(overrideId);
    this.invalidateCache();
    await this.audit.record({
      action: 'core.flag.override_delete',
      entityType: 'FeatureFlagOverride',
      entityId: overrideId,
      oldValue: override,
    });
    return { message: 'Override removido.' };
  }

  // ─── Avaliacao em runtime ───────────────────────────
  /** Resolve TODAS as flags pro ator (mapa key→boolean). */
  async effectiveFor(ctx: FlagContext): Promise<Record<string, boolean>> {
    const flags = await this.getFlagsCached();
    const out: Record<string, boolean> = {};
    for (const flag of flags) {
      out[flag.key] = this.evaluate(flag, ctx);
    }
    return out;
  }

  /** Consulta pontual (uso interno de outros modulos). */
  async isEnabled(key: string, ctx: FlagContext): Promise<boolean> {
    const flags = await this.getFlagsCached();
    const flag = flags.find((f) => f.key === key);
    if (!flag) return false; // flag desconhecida = OFF (automatismo nasce OFF)
    return this.evaluate(flag, ctx);
  }

  private evaluate(flag: FlagWithOverrides, ctx: FlagContext): boolean {
    // Flag expirada = desabilitada (inclusive overrides)
    if (flag.expires_at && flag.expires_at.getTime() <= Date.now()) return false;

    // Precedencia: user > profile > workspace > org
    const byUser = ctx.userId
      ? flag.overrides.find((o) => o.user_id === ctx.userId)
      : undefined;
    if (byUser) return byUser.enabled;

    const byProfile = ctx.profileId
      ? flag.overrides.find((o) => o.profile_id === ctx.profileId && !o.user_id)
      : undefined;
    if (byProfile) return byProfile.enabled;

    const byWorkspace = ctx.workspaceId
      ? flag.overrides.find((o) => o.workspace_id === ctx.workspaceId && !o.user_id && !o.profile_id)
      : undefined;
    if (byWorkspace) return byWorkspace.enabled;

    const byOrg = ctx.organizationId
      ? flag.overrides.find(
          (o) => o.organization_id === ctx.organizationId && !o.user_id && !o.profile_id && !o.workspace_id,
        )
      : undefined;
    if (byOrg) return byOrg.enabled;

    return flag.enabled;
  }

  private async getFlagsCached(): Promise<FlagWithOverrides[]> {
    const now = Date.now();
    if (this.cache && this.cache.expiresAt > now) return this.cache.flags;
    const flags = await this.repository.findAll();
    this.cache = { flags, expiresAt: now + this.CACHE_TTL_MS };
    return flags;
  }

  private invalidateCache(): void {
    this.cache = null;
  }
}
