// Assinatura AWS Signature V4 (S3) com crypto nativo — sem SDK (diretriz 21:
// driver S3-compativel serve AWS S3, Cloudflare R2 e MinIO igualmente).
// Funcoes puras; nenhum estado.
import { createHash, createHmac } from 'crypto';

export interface SigV4Credentials {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
}

export interface SignedRequest {
  url: string;
  headers: Record<string, string>;
}

function sha256Hex(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}

/** Encode de segmento de path conforme exigido pelo SigV4 (RFC 3986). */
function encodeSegment(segment: string): string {
  return encodeURIComponent(segment).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/**
 * Assina uma request S3 path-style (endpoint/bucket/key) com SigV4.
 * Retorna URL final + headers prontos (Authorization, x-amz-date, ...).
 */
export function signS3Request(params: {
  method: 'GET' | 'PUT' | 'DELETE' | 'HEAD';
  endpoint: string; // ex.: https://s3.us-east-1.amazonaws.com
  bucket: string;
  key: string;
  credentials: SigV4Credentials;
  body?: Buffer;
  contentType?: string;
}): SignedRequest {
  const { method, bucket, key, credentials, body, contentType } = params;
  const endpoint = params.endpoint.replace(/\/+$/, '');
  const url = new URL(endpoint);
  const host = url.host;

  const canonicalUri = `/${encodeSegment(bucket)}/${key.split('/').map(encodeSegment).join('/')}`;
  const payloadHash = sha256Hex(body ?? Buffer.alloc(0));

  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const dateStamp = amzDate.slice(0, 8);

  const headersToSign: Record<string, string> = {
    host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  if (contentType) headersToSign['content-type'] = contentType;

  const sortedHeaderKeys = Object.keys(headersToSign).sort();
  const canonicalHeaders = sortedHeaderKeys.map((k) => `${k}:${headersToSign[k].trim()}\n`).join('');
  const signedHeaders = sortedHeaderKeys.join(';');

  const canonicalRequest = [method, canonicalUri, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');

  const scope = `${dateStamp}/${credentials.region}/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonicalRequest)].join('\n');

  const kDate = hmac(`AWS4${credentials.secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, credentials.region);
  const kService = hmac(kRegion, 's3');
  const kSigning = hmac(kService, 'aws4_request');
  const signature = createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex');

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${scope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const headers: Record<string, string> = {
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
    Authorization: authorization,
  };
  if (contentType) headers['Content-Type'] = contentType;

  return { url: `${endpoint}${canonicalUri}`, headers };
}
