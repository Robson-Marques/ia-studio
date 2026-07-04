// Public API (diretriz 57 — camadas Internal → SDK → Public). Fachada estavel
// versionada em /api/v1/public/*, autenticada por API Key (ApiKeyGuard), NUNCA
// por JWT interno. @Public() pula o JwtAuthGuard global; o ApiKeyGuard resolve a
// chave e anexa request.apiKey. Endpoints aqui sao deliberadamente minimos —
// novos recursos publicos entram por aqui, nunca expondo controllers internos.
import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../shared/auth/public.decorator';
import { ApiKeyGuard } from '../api-key.guard';
import { ApiKeyContext } from '../developer.service';

interface PublicRequest {
  apiKey?: ApiKeyContext;
}

@ApiTags('Public API (v1)')
@ApiSecurity('api-key')
@Controller({ path: 'public', version: '1' })
@Public()
@UseGuards(ApiKeyGuard)
export class PublicApiController {
  /** Health check autenticado por chave — util para validar credencial. */
  @Get('ping')
  ping() {
    return { ok: true, service: 'ia-studio', version: 'v1' };
  }

  /** Contexto da chave: organization + escopos (sem dados sensiveis). */
  @Get('me')
  me(@Req() req: PublicRequest) {
    const ctx = req.apiKey;
    return {
      organization_id: ctx?.organization_id ?? null,
      scopes: ctx?.scopes ?? [],
    };
  }
}
