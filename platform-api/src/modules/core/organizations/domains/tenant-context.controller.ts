// Contexto publico do endereco acessado (fase 2). A tela de login chama isto
// ANTES de haver sessao, para saber de quem e a marca a exibir.
//
// Exposicao MINIMA de proposito: nome, slug e branding (o que a tela precisa
// pintar) + a superficie. Nada de id interno, contagem, plano ou qualquer dado
// operacional — e rota aberta. Host desconhecido devolve `matched:false` e o
// painel usa a identidade padrao da plataforma (comportamento de hoje).
import { Controller, Get, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../../shared/auth/public.decorator';
import { HostResolverService } from './host-resolver.service';

@ApiTags('Público — Contexto do endereço')
@Controller('public/tenant-context')
export class TenantContextController {
  constructor(private readonly resolver: HostResolverService) {}

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @Get()
  @ApiOperation({ summary: 'Marca e superfície do endereço acessado (para a tela de login)' })
  async current(@Req() req: { headers: Record<string, unknown> }) {
    const host = this.resolver.hostFromHeaders(req.headers ?? {});
    const ctx = await this.resolver.resolve(host);
    if (!ctx) return { matched: false, hostname: host };
    return {
      matched: true,
      hostname: ctx.hostname,
      scope: ctx.scope,
      surface: ctx.surface,
      organization: ctx.organization
        ? { name: ctx.organization.name, slug: ctx.organization.slug, branding: ctx.organization.branding }
        : null,
    };
  }
}
