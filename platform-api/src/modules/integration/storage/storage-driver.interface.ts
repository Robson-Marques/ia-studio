// Contrato do Storage Manager (diretriz 21): qualquer modulo salva arquivo
// por um IStorageDriver — Local (V1 default) e S3-compativel na V1.
export interface StoragePutResult {
  /** Caminho/chave final onde o objeto ficou gravado. */
  path: string;
  /** Bucket (drivers de objeto) — null no driver local. */
  bucket: string | null;
}

export interface IStorageDriver {
  readonly name: string;
  put(path: string, content: Buffer, mime: string): Promise<StoragePutResult>;
  get(path: string): Promise<Buffer>;
  delete(path: string): Promise<void>;
  /** URL assinada temporaria (opcional — nem todo driver suporta). */
  signedUrl?(path: string, expiresInSeconds: number): Promise<string>;
}
