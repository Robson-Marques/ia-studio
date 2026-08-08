// Endereco canonico do Console (rota publica, sem sessao).
//
// Serve a um proposito so: quando o Console ganha um dominio dedicado, o proprio
// Console — carregado pelo caminho /console/ do dominio principal — descobre
// para onde deve mandar o navegador. Assim o caminho antigo deixa de "existir"
// na pratica, sem precisar editar o vhost principal (que e gerenciado pelo
// certbot, e cirurgia ali quebraria o TLS).
//
// EXPOSICAO: devolve so o hostname do Console. Nao e segredo — o certificado
// desse host esta em Certificate Transparency, publicamente pesquisavel. Nenhum
// dado de organizacao ou de operacao sai por aqui.
import { Controller, Get } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../../shared/auth/public.decorator';
import { PlatformDomainsRepository } from './platform-domains.repository';

@ApiTags('Público — Endereço do Console')
@Controller('public/console-location')
export class ConsoleLocationController {
  constructor(private readonly repository: PlatformDomainsRepository) {}

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @Get()
  @ApiOperation({ summary: 'Endereço canônico do Console (null = sem domínio dedicado)' })
  async current() {
    const row = await this.repository.findCanonicalConsole().catch(() => null);
    return { hostname: row?.hostname ?? null };
  }
}
