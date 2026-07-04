// Driver S3-compativel (AWS S3 / Cloudflare R2 / MinIO) — SigV4 com crypto
// nativo, sem SDK. Config via envs (S3_ENDPOINT/S3_REGION/S3_BUCKET/
// S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY) OU via configure() com dados de uma
// connection do provider "s3" (config + secret).
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { IStorageDriver, StoragePutResult } from './storage-driver.interface';
import { signS3Request } from './sigv4.util';

export interface S3DriverConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

@Injectable()
export class S3StorageDriver implements IStorageDriver {
  readonly name = 's3';

  private overrideConfig: S3DriverConfig | null = null;

  /** Injeta config vinda de uma connection s3 (senao usa envs). */
  configure(config: S3DriverConfig): void {
    this.overrideConfig = config;
  }

  private get config(): S3DriverConfig {
    if (this.overrideConfig) return this.overrideConfig;
    const endpoint = process.env['S3_ENDPOINT'] ?? '';
    const bucket = process.env['S3_BUCKET'] ?? '';
    const accessKeyId = process.env['S3_ACCESS_KEY_ID'] ?? '';
    const secretAccessKey = process.env['S3_SECRET_ACCESS_KEY'] ?? '';
    if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
      throw new InternalServerErrorException(
        'Driver S3 sem configuração: defina S3_ENDPOINT/S3_BUCKET/S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY ou use uma conexão s3.',
      );
    }
    return {
      endpoint,
      region: process.env['S3_REGION'] ?? 'us-east-1',
      bucket,
      accessKeyId,
      secretAccessKey,
    };
  }

  async put(path: string, content: Buffer, mime: string): Promise<StoragePutResult> {
    const cfg = this.config;
    const signed = signS3Request({
      method: 'PUT',
      endpoint: cfg.endpoint,
      bucket: cfg.bucket,
      key: path,
      credentials: cfg,
      body: content,
      contentType: mime,
    });
    const res = await fetch(signed.url, {
      method: 'PUT',
      headers: signed.headers,
      body: new Uint8Array(content),
    });
    if (!res.ok) {
      throw new InternalServerErrorException(`Falha ao gravar no S3 (HTTP ${res.status}).`);
    }
    return { path, bucket: cfg.bucket };
  }

  async get(path: string): Promise<Buffer> {
    const cfg = this.config;
    const signed = signS3Request({
      method: 'GET',
      endpoint: cfg.endpoint,
      bucket: cfg.bucket,
      key: path,
      credentials: cfg,
    });
    const res = await fetch(signed.url, { headers: signed.headers });
    if (!res.ok) {
      throw new InternalServerErrorException(`Falha ao ler do S3 (HTTP ${res.status}).`);
    }
    return Buffer.from(await res.arrayBuffer());
  }

  async delete(path: string): Promise<void> {
    const cfg = this.config;
    const signed = signS3Request({
      method: 'DELETE',
      endpoint: cfg.endpoint,
      bucket: cfg.bucket,
      key: path,
      credentials: cfg,
    });
    const res = await fetch(signed.url, { method: 'DELETE', headers: signed.headers });
    if (!res.ok && res.status !== 404) {
      throw new InternalServerErrorException(`Falha ao excluir do S3 (HTTP ${res.status}).`);
    }
  }
}
