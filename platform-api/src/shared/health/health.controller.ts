// Health check publico (GET /api/v1/health) — usado por nginx/monitoramento e
// pelo install.sh pra confirmar que a API subiu. Sem auth (@Public pula o JWT
// global). Nao toca banco: responde vivo/uptime. Health de dependencias
// (Postgres/Redis/conexões) fica na observabilidade local da instância.
import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/public.decorator';

@ApiTags('Health')
@Controller('health')
@Public()
export class HealthController {
  @Get()
  check() {
    return {
      status: 'ok',
      service: 'ia-studio-api',
      uptime_s: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}
