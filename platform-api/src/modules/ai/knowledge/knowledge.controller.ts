// Bases de conhecimento (RAG): CRUD + documentos/ingestao + teste de consulta.
import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../../shared/auth/permissions.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import { AuthenticatedUser } from '../../../shared/auth/auth.types';
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
  ) {
    return this.knowledge.findBases();
  }

  @Get('bases/:id')
  @RequirePermissions(PERMISSIONS.AI_KNOWLEDGE_READ)
  baseDetail(
    @Param('id') id: string,
  ) {
    return this.knowledge.findBaseDetail(id);
  }

  @Post('bases')
  @RequirePermissions(PERMISSIONS.AI_KNOWLEDGE_WRITE)
  createBase(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateKnowledgeBaseDto,
  ) {
    return this.knowledge.createBase(dto, user.sub);
  }

  @Patch('bases/:id')
  @RequirePermissions(PERMISSIONS.AI_KNOWLEDGE_WRITE)
  updateBase(
    @Param('id') id: string,
    @Body() dto: UpdateKnowledgeBaseDto,
  ) {
    return this.knowledge.updateBase(id, dto);
  }

  @Post('bases/:id/documents')
  @RequirePermissions(PERMISSIONS.AI_KNOWLEDGE_WRITE)
  addDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AddDocumentDto,
  ) {
    return this.knowledge.addDocument(id, dto, user.sub);
  }

  @Post('bases/:id/query')
  @RequirePermissions(PERMISSIONS.AI_KNOWLEDGE_READ)
  query(
    @Param('id') id: string,
    @Body() dto: QueryKnowledgeDto,
  ) {
    return this.knowledge.query(id, dto.query, dto.top_k ?? 5);
  }
}
