// Driver local (V1 default) — grava em STORAGE_LOCAL_PATH (default ./storage).
// Guard anti path-traversal: o caminho resolvido tem que ficar DENTRO da raiz.
import { BadRequestException, Injectable } from '@nestjs/common';
import { mkdir, readFile, unlink, writeFile } from 'fs/promises';
import { dirname, resolve, sep } from 'path';
import { IStorageDriver, StoragePutResult } from './storage-driver.interface';

@Injectable()
export class LocalStorageDriver implements IStorageDriver {
  readonly name = 'local';

  private get root(): string {
    return resolve(process.env['STORAGE_LOCAL_PATH'] ?? './storage');
  }

  private resolveSafe(path: string): string {
    const full = resolve(this.root, path);
    if (full !== this.root && !full.startsWith(this.root + sep)) {
      throw new BadRequestException('Caminho de arquivo inválido.');
    }
    return full;
  }

  async put(path: string, content: Buffer, _mime: string): Promise<StoragePutResult> {
    const full = this.resolveSafe(path);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, content);
    return { path, bucket: null };
  }

  async get(path: string): Promise<Buffer> {
    return readFile(this.resolveSafe(path));
  }

  async delete(path: string): Promise<void> {
    await unlink(this.resolveSafe(path)).catch(() => undefined);
  }
}
