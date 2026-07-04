// Leitura de versao (Fase 8): versao atual + tags git disponiveis maiores que
// a atual. Cache de 5 min (a tela de Atualizacao consulta com frequencia).
//
// Versao atual: prioriza a tag apontada pelo HEAD (git describe --tags), com
// fallback para o primeiro cabecalho "## vX.Y.Z" do CHANGELOG.md. Tags: lista
// `git tag`, filtra as no formato vX.Y.Z e mantem so as maiores que a atual.
import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { appDir } from './system.paths';

const exec = promisify(execFile);
const CACHE_TTL_MS = 5 * 60 * 1000;
const TAG_REGEX = /^v(\d+)\.(\d+)\.(\d+)$/;

export interface VersionInfo {
  current_version: string | null;
  available: string[];
  latest: string | null;
  checked_at: string;
}

@Injectable()
export class VersionService {
  private readonly logger = new Logger(VersionService.name);
  private cache: { info: VersionInfo; at: number } | null = null;

  async getVersionInfo(force = false): Promise<VersionInfo> {
    if (!force && this.cache && Date.now() - this.cache.at < CACHE_TTL_MS) {
      return this.cache.info;
    }
    const current = await this.readCurrentVersion();
    const tags = await this.readTags();
    const available = tags
      .filter((t) => (current ? this.compare(t, current) > 0 : true))
      .sort((a, b) => this.compare(b, a));

    const info: VersionInfo = {
      current_version: current,
      available,
      latest: available[0] ?? null,
      checked_at: new Date().toISOString(),
    };
    this.cache = { info, at: Date.now() };
    return info;
  }

  /** Invalida o cache (ex.: apos um upgrade concluir). */
  invalidate(): void {
    this.cache = null;
  }

  private async readCurrentVersion(): Promise<string | null> {
    // 1) Tag exata do HEAD (git describe). So aceita se casar com vX.Y.Z.
    try {
      const { stdout } = await exec('git', ['describe', '--tags', '--exact-match'], { cwd: appDir() });
      const tag = stdout.trim();
      if (TAG_REGEX.test(tag)) return tag;
    } catch {
      // HEAD nao aponta exatamente numa tag — segue pro fallback.
    }
    // 2) Fallback: primeiro "## vX.Y.Z" do CHANGELOG.md.
    try {
      const changelog = await readFile(path.join(appDir(), 'CHANGELOG.md'), 'utf8');
      const m = changelog.match(/^##\s+(v\d+\.\d+\.\d+)/m);
      if (m) return m[1] ?? null;
    } catch (e) {
      this.logger.warn(`Falha ao ler CHANGELOG.md: ${(e as Error).message}`);
    }
    return null;
  }

  private async readTags(): Promise<string[]> {
    try {
      const { stdout } = await exec('git', ['tag', '--list', 'v*'], { cwd: appDir() });
      return stdout
        .split('\n')
        .map((t) => t.trim())
        .filter((t) => TAG_REGEX.test(t));
    } catch (e) {
      this.logger.warn(`Falha ao listar tags git: ${(e as Error).message}`);
      return [];
    }
  }

  /** Compara vX.Y.Z. >0 se a>b, <0 se a<b, 0 se igual. */
  private compare(a: string, b: string): number {
    const pa = TAG_REGEX.exec(a);
    const pb = TAG_REGEX.exec(b);
    if (!pa || !pb) return a.localeCompare(b);
    for (let i = 1; i <= 3; i++) {
      const da = Number(pa[i]);
      const db = Number(pb[i]);
      if (da !== db) return da - db;
    }
    return 0;
  }
}
