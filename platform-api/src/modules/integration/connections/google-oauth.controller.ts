// Rotas OAuth do Google (Fase 7). start = autenticada (permissao de conexoes);
// callback = PUBLICA e VERSION_NEUTRAL (a URL registrada no Google nao carrega
// /v1). O callback devolve um HTML minimo que fecha o popup e sinaliza sucesso.
import {
  Controller,
  Get,
  Logger,
  Query,
  Res,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { FastifyReply } from 'fastify';
import { RequirePermissions } from '../../../shared/auth/permissions.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { Public } from '../../../shared/auth/public.decorator';
import { GoogleOauthService } from './google-oauth.service';

@ApiTags('Integrations — OAuth Google')
@Controller({ path: 'integrations/oauth/google', version: VERSION_NEUTRAL })
export class GoogleOauthController {
  private readonly logger = new Logger(GoogleOauthController.name);

  constructor(private readonly oauth: GoogleOauthService) {}

  // ─── Start (autenticado) ────────────────────────────

  @Get('start')
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_CONNECTIONS_WRITE)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Inicia o consentimento OAuth do Google (URL de consentimento com state assinado)' })
  start(
    @Query('connection_id') connectionId: string,
  ) {
    return this.oauth.start(connectionId);
  }

  // ─── Callback (publico) ─────────────────────────────

  @Public()
  @Get('callback')
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @ApiOperation({ summary: 'Callback do OAuth Google (troca code por tokens e ativa a conexão)' })
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    if (error) {
      this.logger.warn(`OAuth Google negado: ${error}`);
      return this.sendHtml(reply, false, `Autorização recusada (${error}).`);
    }
    if (!code || !state) {
      return this.sendHtml(reply, false, 'Requisição de callback incompleta (code/state ausentes).');
    }
    try {
      const result = await this.oauth.callback(code, state);
      return this.sendHtml(
        reply,
        true,
        result.account ? `Conta ${result.account} conectada com sucesso.` : 'Conta Google conectada com sucesso.',
      );
    } catch (e) {
      this.logger.error(`Falha no callback OAuth Google: ${(e as Error).message}`);
      return this.sendHtml(reply, false, (e as Error).message || 'Falha ao concluir a autenticação.');
    }
  }

  private sendHtml(reply: FastifyReply, ok: boolean, message: string): void {
    const color = ok ? '#059669' : '#dc2626';
    const title = ok ? 'Conexão autorizada' : 'Falha na autorização';
    // postMessage sinaliza a janela abridora (o painel faz polling do status
    // de qualquer forma; o window.close() é o caminho feliz).
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#0b0f19;color:#e5e7eb;
display:flex;align-items:center;justify-content:center;min-height:100dvh;margin:0}
.card{max-width:420px;padding:32px;text-align:center;background:#111827;border:1px solid #1f2937;border-radius:16px}
h1{font-size:18px;margin:0 0 8px;color:${color}}p{font-size:14px;color:#9ca3af;margin:0 0 20px}
button{background:${color};color:#fff;border:0;border-radius:8px;padding:10px 18px;font-size:14px;cursor:pointer}</style>
</head><body><div class="card"><h1>${title}</h1><p>${message}</p>
<button onclick="window.close()">Fechar janela</button></div>
<script>try{window.opener&&window.opener.postMessage({type:'iastudio_google_oauth',ok:${ok}},'*');}catch(e){}
setTimeout(function(){try{window.close();}catch(e){}},${ok ? 1500 : 6000});</script>
</body></html>`;
    void reply.code(ok ? 200 : 400).header('Content-Type', 'text/html; charset=utf-8').send(html);
  }
}
