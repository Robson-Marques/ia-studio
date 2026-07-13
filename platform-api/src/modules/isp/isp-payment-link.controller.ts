// Rota PÚBLICA da 2ª via (frente 5). Sem login: a página /pagar/:token consome.
// Token de 48 chars (inguessável) + throttle contra brute force + 410 genérico
// quando inválido/expirado (o service não enumera tokens).
import { Controller, Get, Param } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../shared/auth/public.decorator';
import { IspPaymentLinkService } from './isp-payment-link.service';

@ApiTags('ISP · Pagamento (público)')
@Controller('isp/pagamento')
export class IspPaymentLinkController {
  constructor(private readonly service: IspPaymentLinkService) {}

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @Get(':token')
  @ApiOperation({ summary: 'Dados públicos da 2ª via (link tokenizado, sem login)' })
  resolve(@Param('token') token: string) {
    return this.service.resolvePublic(token);
  }
}
