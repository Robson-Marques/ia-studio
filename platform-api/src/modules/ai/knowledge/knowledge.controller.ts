// Bases de conhecimento (RAG): CRUD + documentos/ingestao + teste de consulta.
import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../../shared/auth/permissions.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import { AuthenticatedUser } from '../../../shared/auth/auth.types';
import { resolveOrganizationId } from '../../../shared/auth/tenant.util';
import { KnowledgeService } from './knowledge.service';
import {
  AddDocumentDto,
  CreateKnowledgeBaseDto,
  QueryKnowledgeDto,
  UpdateKnowledgeBaseDto,
} from './dto/knowledge.dtos';

@ApiTags('IA — Conhecimento')
@ApiBearerAuth()
@Controller('ai/knowledge')
export class KnowledgeController {
  constructor(private readonly knowledge: KnowledgeService) {}

  @Get('bases')
  @RequirePermissions(PERMISSIONS.AI_KNOWLEDGE_READ)
  listBases(
    @CurrentUser() user: AuthenticatedUser,
    @Query('workspace_id') workspaceId?: string,
    @Query('environment_id') environmentId?: string,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.knowledge.findBases(resolveOrganizationId(user, orgQuery), { workspaceId, environmentId });
  }

  @Get('bases/:id')
  @RequirePermissions(PERMISSIONS.AI_KNOWLEDGE_READ)
  baseDetail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.knowledge.findBaseDetail(resolveOrganizationId(user, orgQuery), id);
  }

  @Post('bases')
  @RequirePermissions(PERMISSIONS.AI_KNOWLEDGE_WRITE)
  createBase(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateKnowledgeBaseDto,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.knowledge.createBase(resolveOrganizationId(user, orgQuery), dto, user.sub);
  }

  @Patch('bases/:id')
  @RequirePermissions(PERMISSIONS.AI_KNOWLEDGE_WRITE)
  updateBase(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateKnowledgeBaseDto,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.knowledge.updateBase(resolveOrganizationId(user, orgQuery), id, dto);
  }

  @Post('bases/:id/documents')
  @RequirePermissions(PERMISSIONS.AI_KNOWLEDGE_WRITE)
  addDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AddDocumentDto,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.knowledge.addDocument(resolveOrganizationId(user, orgQuery), id, dto, user.sub);
  }

  @Post('bases/:id/query')
  @RequirePermissions(PERMISSIONS.AI_KNOWLEDGE_READ)
  query(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: QueryKnowledgeDto,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.knowledge.query(resolveOrganizationId(user, orgQuery), id, dto.query, dto.top_k ?? 5);
  }
}
