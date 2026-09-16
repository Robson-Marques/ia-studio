// Controller do Console do Desenvolvedor (Fase 7 — diretriz 28). perm
// `devtools.use`. Mutations sensiveis auditadas (@Auditable — params redactados)
// e cada execucao via connection gera IntegrationLog no ConnectionsService.
import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../shared/auth/permissions.decorator';
import { PERMISSIONS } from '../../shared/permissions.constants';
import { Auditable } from '../../shared/audit/auditable.decorator';
import { DevtoolsService } from './devtools.service';
import { ExecuteTestDto, SqlTestDto, HttpTestDto, AiTestDto, ToolTestDto } from './dto/devtools.dtos';

@ApiTags('Desenvolvedor — Console (Postman interno)')
@ApiBearerAuth()
@Controller('devtools')
export class DevtoolsController {
  constructor(private readonly devtools: DevtoolsService) {}

  @Post('execute')
  @RequirePermissions(PERMISSIONS.DEVTOOLS_USE)
  @Auditable({ action: 'devtools.execute', entityType: 'Devtools', captureParams: true })
  runExecute(
    @Body() dto: ExecuteTestDto,
  ) {
    return this.devtools.runExecute(dto);
  }

  @Post('sql')
  @RequirePermissions(PERMISSIONS.DEVTOOLS_USE)
  @Auditable({ action: 'devtools.sql', entityType: 'Devtools', captureParams: true })
  runSql(
    @Body() dto: SqlTestDto,
  ) {
    return this.devtools.runSql(dto);
  }

  @Post('http')
  @RequirePermissions(PERMISSIONS.DEVTOOLS_USE)
  @Auditable({ action: 'devtools.http', entityType: 'Devtools', captureParams: true, sensitiveFields: ['value', 'authorization'] })
  runHttp(
    @Body() dto: HttpTestDto,
  ) {
    return this.devtools.runHttp(dto);
  }

  @Post('ai')
  @RequirePermissions(PERMISSIONS.DEVTOOLS_USE)
  @Auditable({ action: 'devtools.ai', entityType: 'Devtools', captureParams: true })
  runAi(
    @Body() dto: AiTestDto,
  ) {
    return this.devtools.runAi(dto);
  }

  @Post('tool')
  @RequirePermissions(PERMISSIONS.DEVTOOLS_USE)
  @Auditable({ action: 'devtools.tool', entityType: 'Devtools', captureParams: true })
  runTool(
    @Body() dto: ToolTestDto,
  ) {
    return this.devtools.runTool(dto);
  }
}
