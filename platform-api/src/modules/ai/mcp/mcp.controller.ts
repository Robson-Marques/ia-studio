// MCP Client (diretriz 15) — cadastro + sincronizacao de servidores MCP
// externos. Sem DELETE: servidor e desativado (is_active=false), nunca excluido.
import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../../shared/auth/permissions.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import { AuthenticatedUser } from '../../../shared/auth/auth.types';
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
  ) {
    return this.mcp.list();
  }

  /** Cache de tools descobertas na ultima sincronizacao. */
  @Get(':id/tools')
  @RequirePermissions(PERMISSIONS.AI_MCP_READ)
  discoveredTools(
    @Param('id') id: string,
  ) {
    return this.mcp.discoveredTools(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.AI_MCP_WRITE)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateMcpServerDto,
  ) {
    return this.mcp.create(dto, user.sub);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.AI_MCP_WRITE)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateMcpServerDto,
  ) {
    return this.mcp.update(id, dto);
  }

  /** Descoberta remota de tools (JSON-RPC "tools/list"). STDIO nao descobre. */
  @Post(':id/sync')
  @RequirePermissions(PERMISSIONS.AI_MCP_WRITE)
  sync(
    @Param('id') id: string,
  ) {
    return this.mcp.sync(id);
  }
}
