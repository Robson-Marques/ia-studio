// Leitura de versao (Fase 8): versao atual + tags git disponiveis maiores que
// a atual. Cache de 5 min (a tela de Atualizacao consulta com frequencia).
//
// Versao atual: prioriza a tag apontada pelo HEAD (git describe --tags), com
// fallback para o primeiro cabecalho "## vX.Y.Z" do CHANGELOG.md.
//
// Tags: `git fetch --tags` no remoto ANTES de `git tag --list`. Sem o fetch, o
// clone de /opt/iastudio so enxerga as tags que existiam na instalacao e a tela
// dizia "Instancia atualizada" pra sempre. O fetch e best-effort: sem rede ou
// sem credencial, cai nas tags locais (a tela degrada, nao quebra).
//
// BLINDAGEM (contra contaminacao entre sistemas): o `/opt` pode acabar com uma
// tag de OUTRO sistema (ex.: uma `v2.2.62` do AquaPark entrou no repo do IA
// Studio e foi lida como "versao atual", travando o painel — ela era maior que
// qualquer v0.10.x). O CHANGELOG.md e' conteudo SEMPRE do proprio sistema
// (versionado no repo), entao a LINHA de versao (o `major` do topo do CHANGELOG)
// e' a ancora: `git describe` e `git tag --list` so aceitam tags do mesmo major.
// Uma tag de outra linha e' ignorada, nunca vira "atual" nem "disponivel". Se o
// CHANGELOG nao puder ser lido, o filtro e' desligado (degrada pro comportamento
// antigo, nao quebra).
import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { appDir } from './system.paths';

const exec = promisify(execFile);
const CACHE_TTL_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 20_000;
const TAG_REGEX = /^v(\d+)\.(\d+)\.(\d+)$/;

export interface VersionInfo {
  current_version: string | null;
  available: string[];
  latest: string | null;
  checked_at: string;
  /** false quando o `git fetch` falhou — a lista pode estar desatualizada. */
  remote_synced: boolean;
}

@Injectable()
export class VersionService {
  private readonly logger = new Logger(VersionService.name);
  private cache: { info: VersionInfo; at: number } | null = null;

  async getVersionInfo(force = false): Promise<VersionInfo> {
    if (!force && this.cache && Date.now() - this.cache.at < CACHE_TTL_MS) {
      return this.cache.info;
    }
    const expectedMajor = await this.readExpectedMajor();
    const current = await this.readCurrentVersion(expectedMajor);
    const remoteSynced = await this.fetchTags();
    const tags = await this.readTags(expectedMajor);
    const newer = tags
      .filter((t) => (current ? this.compare(t, current) > 0 : true))
      .sort((a, b) => this.compare(b, a));
    // Uma tag com número maior pode ter sido criada em outra branch. Só é uma
    // atualização válida quando contém a versão atualmente instalada em sua
    // própria ancestralidade; caso contrário o checkout pode reintroduzir um
    // schema antigo e fazer o Prisma tentar desfazer a linha dedicada.
    const available = current
      ? (await Promise.all(newer.map(async (tag) => ({
          tag,
          valid: await this.isDescendantOfCurrent(current, tag),
        })))).filter((item) => item.valid).map((item) => item.tag)
      : newer;

    const info: VersionInfo = {
      current_version: current,
      available,
      latest: available[0] ?? null,
      checked_at: new Date().toISOString(),
      remote_synced: remoteSynced,
    };
    this.cache = { info, at: Date.now() };
    return info;
  }

  /** Invalida o cache (ex.: apos um upgrade concluir). */
  invalidate(): void {
    this.cache = null;
  }

  /**
   * `major` esperado da linha de versao deste sistema — o do topo do CHANGELOG.md
   * (conteudo sempre do proprio repo). `null` quando nao da pra ler: nesse caso o
   * filtro de blindagem fica desligado (degrada pro comportamento antigo).
   */
  private async readExpectedMajor(): Promise<number | null> {
    try {
      const changelog = await readFile(path.join(appDir(), 'CHANGELOG.md'), 'utf8');
      const m = changelog.match(/^##\s+v(\d+)\.\d+\.\d+/m);
      if (m) return Number(m[1]);
    } catch (e) {
      this.logger.warn(`Falha ao ler CHANGELOG.md (blindagem desligada): ${(e as Error).message}`);
    }
    return null;
  }

  /** true se a tag e' da linha de versao esperada (mesmo major) ou se nao ha ancora. */
  private isOwnLine(tag: string, expectedMajor: number | null): boolean {
    if (expectedMajor == null) return true;
    const p = TAG_REGEX.exec(tag);
    return !!p && Number(p[1]) === expectedMajor;
  }

  private async readCurrentVersion(expectedMajor: number | null): Promise<string | null> {
    // 1) Tag exata do HEAD (git describe). So aceita se casar com vX.Y.Z E for da
    //    linha de versao deste sistema — uma tag de outro sistema no HEAD e' ignorada.
    try {
      const { stdout } = await exec('git', ['describe', '--tags', '--exact-match'], { cwd: appDir() });
      const tag = stdout.trim();
      if (TAG_REGEX.test(tag) && this.isOwnLine(tag, expectedMajor)) return tag;
    } catch {
      // HEAD nao aponta exatamente numa tag — segue pro fallback.
    }
    // Pode existir mais de uma tag no mesmo commit (incluindo tags antigas
    // fora do padrão). git describe --exact-match escolhe apenas uma delas.
    // Consultar TODAS as tags do HEAD antes de recorrer ao CHANGELOG impede
    // que uma tag não-semver faça a versão instalada regredir no painel.
    try {
      const { stdout } = await exec('git', ['tag', '--points-at', 'HEAD'], { cwd: appDir() });
      const exactTags = stdout.split('\n').map((tag) => tag.trim())
        .filter((tag) => TAG_REGEX.test(tag) && this.isOwnLine(tag, expectedMajor))
        .sort((a, b) => this.compare(b, a));
      if (exactTags[0]) return exactTags[0];
    } catch (e) {
      this.logger.warn(`Falha ao consultar tags do HEAD: ${(e as Error).message}`);
    }
    // 2) Fallback: primeiro "## vX.Y.Z" do CHANGELOG.md (sempre deste sistema).
    try {
      const changelog = await readFile(path.join(appDir(), 'CHANGELOG.md'), 'utf8');
      const m = changelog.match(/^##\s+(v\d+\.\d+\.\d+)/m);
      if (m) return m[1] ?? null;
    } catch (e) {
      this.logger.warn(`Falha ao ler CHANGELOG.md: ${(e as Error).message}`);
    }
    return null;
  }

  /**
   * Traz as tags novas do remoto. `--force` porque tag anotada e imutavel: se
   * alguem reescrever uma tag no remoto, o fetch sem --force falharia e
   * derrubaria a lista inteira. Retorna false se o fetch nao aconteceu.
   */
  private async fetchTags(): Promise<boolean> {
    try {
      await exec('git', ['fetch', '--tags', '--force', '--quiet'], {
        cwd: appDir(),
        timeout: FETCH_TIMEOUT_MS,
      });
      return true;
    } catch (e) {
      this.logger.warn(`git fetch --tags falhou (usando tags locais): ${(e as Error).message}`);
      return false;
    }
  }

  private async readTags(expectedMajor: number | null): Promise<string[]> {
    try {
      const { stdout } = await exec('git', ['tag', '--list', 'v*'], { cwd: appDir() });
      return stdout
        .split('\n')
        .map((t) => t.trim())
        .filter((t) => TAG_REGEX.test(t) && this.isOwnLine(t, expectedMajor));
    } catch (e) {
      this.logger.warn(`Falha ao listar tags git: ${(e as Error).message}`);
      return [];
    }
  }

  private async isDescendantOfCurrent(current: string, candidate: string): Promise<boolean> {
    try {
      await exec('git', ['merge-base', '--is-ancestor', current, candidate], { cwd: appDir() });
      return true;
    } catch (e) {
      const code = (e as { code?: number | string }).code;
      if (code !== 1 && code !== '1') {
        this.logger.warn(`Não foi possível validar a linhagem de ${candidate}: ${(e as Error).message}`);
      } else {
        this.logger.warn(`Tag ${candidate} ignorada: não descende da versão instalada ${current}.`);
      }
      return false;
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
