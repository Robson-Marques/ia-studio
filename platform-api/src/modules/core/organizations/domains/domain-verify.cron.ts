// Reverificacao automatica dos enderecos que ainda nao entraram no ar.
//
// Existe porque propagacao de DNS demora: sem isto, o operador teria que ficar
// clicando em "Verificar e ativar" ate o apontamento propagar. Com isto, o
// endereco entra no ar sozinho quando o DNS resolver.
//
// NASCE OFF (regra do projeto: todo comportamento automatico nasce desligado e
// e ligado por toggle do usuario). O toggle mora em `system_settings` da
// plataforma (`platform.domains.auto_verify`) e e editavel na tela Enderecos.
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DomainSyncService } from './domain-sync.service';
import { PlatformDomainsRepository } from './platform-domains.repository';

@Injectable()
export class DomainVerifyCron {
  private readonly logger = new Logger(DomainVerifyCron.name);
  private running = false;

  constructor(
    private readonly sync: DomainSyncService,
    private readonly repository: PlatformDomainsRepository,
  ) {}

  // A cada 30 min: barato (so roda o script quando ha o que verificar).
  //
  // SEM o gate `processorsEnabled()` de proposito: aquele gate serve pros
  // processors de fila, que rodam no WORKER. Este cron vive no
  // InstallationDomainsModule, que o `worker.module.ts` NAO importa — então só
  // existe no processo da API. Com o gate, nao dispararia em lugar nenhum em
  // producao (`WORKER_INLINE=off`), e o toggle ligado nao faria nada.
  @Cron(CronExpression.EVERY_30_MINUTES)
  async tick(): Promise<void> {
    if (this.running) return;
    if (!(await this.repository.isAutoVerifyEnabled())) return;

    this.running = true;
    try {
      const pending = await this.repository.countPending();
      if (pending === 0) return;
      this.sync.runPending();
      this.logger.log(`Reverificação automática disparada (${pending} endereço(s) aguardando).`);
    } catch (e) {
      this.logger.warn(`Reverificação automática falhou: ${(e as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
