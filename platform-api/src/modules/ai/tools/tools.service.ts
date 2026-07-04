// Catalogo de tools (ai_tools): CRUD das custom + leitura das builtin.
// Tools builtin sao read-only (semeadas pelo AiProvidersSeedService); custom
// referenciam connection_operation. Tool nunca e deletada — so is_active=false.
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AiTool, Prisma } from '@prisma/client';
import { ToolsRepository } from './tools.repository';
import { AuditLogService } from '../../../shared/audit/audit-log.service';
import { assertSameOrg } from '../../../shared/auth/tenant.util';
import { CreateToolDto, UpdateToolDto } from './dto/tools.dtos';

@Injectable()
export class ToolsService {
  private readonly logger = new Logger(ToolsService.name);

  constructor(
    private readonly repository: ToolsRepository,
    private readonly audit: AuditLogService,
  ) {}

  findAll(organizationId: string, onlyActive = false) {
    return this.repository.findAll(organizationId, { onlyActive });
  }

  async findOne(organizationId: string, id: string): Promise<AiTool> {
    const tool = await this.repository.findById(id);
    if (!tool) throw new NotFoundException('Ferramenta não encontrada.');
    assertSameOrg(tool.organization_id, organizationId);
    return tool;
  }

  async create(organizationId: string, dto: CreateToolDto, createdBy: string | null) {
    const existing = await this.repository.findByKey(organizationId, dto.key);
    if (existing) throw new ConflictException(`Já existe uma ferramenta com a chave "${dto.key}".`);
    const tool = await this.repository.create({
      organization_id: organizationId,
      key: dto.key,
      name: dto.name,
      description: dto.description,
      category: dto.category ?? 'sistema',
      input_schema: (dto.input_schema ?? {}) as Prisma.InputJsonValue,
      builtin: false,
      connection_operation:
        dto.connection_operation === undefined ? undefined : (dto.connection_operation as Prisma.InputJsonValue),
      requires_approval: dto.requires_approval ?? false,
      timeout_ms: dto.timeout_ms ?? 20000,
      created_by: createdBy,
    });
    await this.audit.record({
      action: 'ai.tool.create',
      entityType: 'AiTool',
      entityId: tool.id,
      organizationId,
      newValue: { key: tool.key, name: tool.name },
    });
    return tool;
  }

  async update(organizationId: string, id: string, dto: UpdateToolDto) {
    const before = await this.findOne(organizationId, id);
    if (before.builtin) {
      // Builtin: so permite ativar/desativar e ajustar requires_approval/timeout.
      const disallowed = dto.name || dto.description || dto.input_schema || dto.connection_operation;
      if (disallowed) {
        throw new BadRequestException('Ferramenta builtin não permite editar nome/descrição/schema.');
      }
    }
    const data: Prisma.AiToolUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.category !== undefined) data.category = dto.category;
    if (dto.input_schema !== undefined) data.input_schema = dto.input_schema as Prisma.InputJsonValue;
    if (dto.connection_operation !== undefined) {
      data.connection_operation = dto.connection_operation as Prisma.InputJsonValue;
    }
    if (dto.requires_approval !== undefined) data.requires_approval = dto.requires_approval;
    if (dto.timeout_ms !== undefined) data.timeout_ms = dto.timeout_ms;
    if (dto.is_active !== undefined) data.is_active = dto.is_active;
    const tool = await this.repository.update(id, data);
    await this.audit.record({
      action: 'ai.tool.update',
      entityType: 'AiTool',
      entityId: id,
      organizationId,
      oldValue: { name: before.name, is_active: before.is_active },
      newValue: { name: tool.name, is_active: tool.is_active },
    });
    return tool;
  }

  /** Resolve as tools de um agente (allowed_tools) pro formato do runner. */
  resolveForAgent(organizationId: string, keys: string[]) {
    if (keys.length === 0) return Promise.resolve([] as AiTool[]);
    return this.repository.findByKeys(organizationId, keys);
  }
}
