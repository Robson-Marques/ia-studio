// Disparo da SINCRONIZACAO de um endereco (vhost + certificado) a partir da
// interface — o botao "Verificar e ativar" do Console.
//
// Mesmo padrao ja consagrado no `UpgradeService`: spawn DETACHED do script em
// `scripts/`, stdio ignorado, e o resultado volta pelo BANCO (o proprio script
// grava `status`/`cert_status`/`last_error` na linha do endereco). A tela le o
// registro de novo e mostra a situacao.
//
// A fronteira app↔infra continua respeitada: nginx/TLS NAO entra no deploy por
// tag (o `upgrade.sh` nao toca no nginx). Aqui e OPERACAO, disparada
// explicitamente por um administrador da plataforma.
import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'node:child_process';
import * as path from 'node:path';
import { scriptsDir } from '../../../system/system.paths';

/** Aceita so o que e hostname — o valor vai para a linha de comando do script. */
const SAFE_HOST = /^[a-z0-9.-]+$/;

@Injectable()
export class DomainSyncService {
  private readonly logger = new Logger(DomainSyncService.name);

  /**
   * Dispara `domains-sync.sh --host <hostname>` em background. Retorna assim que
   * o processo sai (nao espera o certificado): quem acompanha e a situacao do
   * endereco no registro.
   */
  run(hostname: string): { started: boolean; reason?: string } {
    const host = String(hostname ?? '').trim().toLowerCase();
    if (!host || !SAFE_HOST.test(host)) {
      return { started: false, reason: 'Endereço inválido.' };
    }
    const script = path.join(scriptsDir(), 'domains-sync.sh');
    try {
      const child = spawn('bash', [script, '--host', host], {
        detached: true,
        stdio: 'ignore',
        cwd: scriptsDir(),
      });
      child.on('error', (err) => {
        this.logger.error(`Falha ao iniciar domains-sync.sh para ${host}: ${err.message}`);
      });
      child.unref();
      this.logger.log(`domains-sync.sh disparado para ${host}.`);
      return { started: true };
    } catch (e) {
      this.logger.error(`Erro ao spawnar domains-sync.sh: ${(e as Error).message}`);
      return { started: false, reason: 'Não foi possível iniciar a verificação no servidor.' };
    }
  }

  /**
   * Varredura dos PENDENTES (usada pela reverificação automática). `--pending`
   * de propósito: varrer tudo periodicamente re-chamaria o certbot em quem já
   * está no ar, sem necessidade e arriscando o limite do Let's Encrypt.
   */
  runPending(): { started: boolean } {
    const script = path.join(scriptsDir(), 'domains-sync.sh');
    try {
      const child = spawn('bash', [script, '--pending'], { detached: true, stdio: 'ignore', cwd: scriptsDir() });
      child.on('error', (err) => this.logger.error(`Falha no sweep de domínios: ${err.message}`));
      child.unref();
      return { started: true };
    } catch (e) {
      this.logger.error(`Erro ao spawnar o sweep de domínios: ${(e as Error).message}`);
      return { started: false };
    }
  }
}
