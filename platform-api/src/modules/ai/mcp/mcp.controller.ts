// MCP Client (diretriz 15) — cadastro + sincronizacao de servidores MCP
// externos. Sem DELETE: servidor e desativado (is_active=false), nunca excluido.
import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../../shared/auth/permissions.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import { AuthenticatedUser } from '../../../shared/auth/auth.types';
import { resolveOrganizationId } from '../../../shared/auth/tenant.util';
import { McpClientService } from './mcp-client.service';
import { CreateMcpServerDto, UpdateMcpServerDto } from './dto/mcp.dtos';

@ApiTags('IA — MCP')
@ApiBearerAuth()
@Controller('ai/mcp')
export class McpController {
  constructor(private readonly mcp: McpClientService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.AI_MCP_READ)
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('workspace_id') workspaceId?: string,
    @Query('environment_id') environmentId?: string,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.mcp.list(resolveOrganizationId(user, orgQuery), { workspaceId, environmentId });
  }

  /** Cache de tools descobertas na ultima sincronizacao. */
  @Get(':id/tools')
  @RequirePermissions(PERMISSIONS.AI_MCP_READ)
  discoveredTools(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.mcp.discoveredTools(resolveOrganizationId(user, orgQuery), id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.AI_MCP_WRITE)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateMcpServerDto,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.mcp.create(resolveOrganizationId(user, orgQuery), dto, user.sub);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.AI_MCP_WRITE)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateMcpServerDto,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.mcp.update(resolveOrganizationId(user, orgQuery), id, dto);
  }

  /** Descoberta remota de tools (JSON-RPC "tools/list"). STDIO nao descobre. */
  @Post(':id/sync')
  @RequirePermissions(PERMISSIONS.AI_MCP_WRITE)
  sync(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.mcp.sync(resolveOrganizationId(user, orgQuery), id);
  }
}
