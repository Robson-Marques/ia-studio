// Configuracao do JWT — resolvida em runtime (nao no import) pra garantir
// que o .env ja foi carregado. Em producao exige segredo forte (>=32 chars).
export const JWT_EXPIRES_IN = '8h';

export function getJwtSecret(): string {
  const secret = process.env['JWT_SECRET'] ?? '';
  const isProd = (process.env['NODE_ENV'] ?? 'production') === 'production';
  if (secret.length >= 32) return secret;
  if (isProd) {
    throw new Error('JWT_SECRET ausente ou fraco em producao (minimo 32 caracteres). Defina no .env.');
  }
  return 'iastudio-dev-unsafe-jwt-secret-32chars!!';
}
