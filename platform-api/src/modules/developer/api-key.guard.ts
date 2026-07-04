// Guard da Public API (diretriz 57): resolve a chave por `x-api-key` ou
// `Authorization: Bearer <chave>` → DeveloperService.authenticate → anexa
// `request.apiKey` (ApiKeyContext). Rotas publicas usam @Public() (pula o JWT)
// + @UseGuards(ApiKeyGuard). Nunca expor endpoints internos por aqui.
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { DeveloperService } from './developer.service';

interface ApiKeyRequest {
  headers: Record<string, string | string[] | undefined>;
  apiKey?: unknown;
}

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly developer: DeveloperService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<ApiKeyRequest>();
    const raw = ApiKeyGuard.extract(req.headers);
    if (!raw) throw new ForbiddenException('Informe a chave de API (header x-api-key ou Authorization: Bearer).');
    const ctx = await this.developer.authenticate(raw);
    req.apiKey = ctx;
    return true;
  }

  private static extract(headers: Record<string, string | string[] | undefined>): string | null {
    const apiKeyHeader = headers['x-api-key'];
    if (typeof apiKeyHeader === 'string' && apiKeyHeader.trim()) return apiKeyHeader.trim();
    const auth = headers['authorization'];
    if (typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')) {
      const token = auth.slice(7).trim();
      // Chave da Public API sempre comeca com ias_ (evita colisao com JWT).
      if (token.startsWith('ias_')) return token;
    }
    return null;
  }
}
