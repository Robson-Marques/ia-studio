#!/usr/bin/env node
/** Provisiona o WAHA WEBJS local e preserva as sessões em volume Docker. */
const childProcess = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const API_ENV_PATH = path.join(ROOT, 'platform-api', '.env');
const DEFAULT_IMAGE = 'devlikeapro/waha:latest-2026.10.1';

function exec(bin, args, options = {}) {
  const result = childProcess.execFileSync(bin, args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: options.quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  return result ? result.toString().trim() : '';
}

function has(bin) {
  try {
    childProcess.execFileSync('sh', ['-c', `command -v ${bin}`], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function parseEnv(content) {
  const values = {};
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match) values[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
  return values;
}

function appendMissing(file, additions) {
  if (!fs.existsSync(file)) return;
  let content = fs.readFileSync(file, 'utf8');
  const current = parseEnv(content);
  const missing = Object.entries(additions).filter(([key]) => !current[key]);
  if (!missing.length) return;
  content = content.replace(/\n*$/, '\n');
  content += `\n# WAHA local (Docker; API restrita ao host)\n${missing.map(([key, value]) => `${key}=${value}`).join('\n')}\n`;
  fs.writeFileSync(file, content, { mode: 0o600 });
  fs.chmodSync(file, 0o600);
}

function listeningPorts() {
  if (!has('ss')) return new Set();
  const output = exec('ss', ['-ltnH'], { quiet: true });
  return new Set([...output.matchAll(/:(\d+)\s/g)].map((match) => Number(match[1])));
}

function firstFreePort(start = 3400) {
  const used = listeningPorts();
  for (let port = start; port < start + 200; port += 1) {
    if (!used.has(port)) return port;
  }
  throw new Error(`não há porta livre entre ${start} e ${start + 199} para o WAHA`);
}

function safeName(value) {
  const name = String(value || '').toLowerCase().replace(/[^a-z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!name) throw new Error('IASTUDIO_APP_ID inválido para provisionar o WAHA');
  return name.slice(0, 48);
}

function ensureEnvironment() {
  if (!fs.existsSync(API_ENV_PATH)) throw new Error('platform-api/.env não encontrado');
  const current = parseEnv(fs.readFileSync(API_ENV_PATH, 'utf8'));
  const appId = safeName(current.IASTUDIO_APP_ID);
  const apiPort = Number(current.PORT || 3000);
  if (!Number.isInteger(apiPort) || apiPort < 1 || apiPort > 65535) throw new Error('PORT da API inválida');
  const wahaPort = current.IASTUDIO_WAHA_PORT || String(firstFreePort());
  const additions = {
    IASTUDIO_WAHA_PORT: wahaPort,
    IASTUDIO_WAHA_URL: current.IASTUDIO_WAHA_URL || `http://127.0.0.1:${wahaPort}`,
    IASTUDIO_WAHA_API_KEY: current.IASTUDIO_WAHA_API_KEY || crypto.randomBytes(32).toString('hex'),
    IASTUDIO_WAHA_WEBHOOK_URL: current.IASTUDIO_WAHA_WEBHOOK_URL || `http://host.docker.internal:${apiPort}/api/webhooks/whatsapp/waha`,
    IASTUDIO_WAHA_IMAGE: current.IASTUDIO_WAHA_IMAGE || DEFAULT_IMAGE,
  };
  appendMissing(API_ENV_PATH, additions);
  appendMissing(`/etc/iastudio/apps/${appId}.env`, additions);
  return { ...current, ...additions, appId };
}

function ensureDocker(installDocker) {
  if (has('docker')) return;
  if (!installDocker || process.getuid?.() !== 0 || !fs.existsSync('/etc/debian_version')) {
    throw new Error('Docker não está instalado no servidor');
  }
  exec('apt-get', ['update']);
  exec('apt-get', ['install', '-y', 'docker.io']);
  exec('systemctl', ['enable', '--now', 'docker']);
}

function expectedEnvironment(env) {
  return [
    `WAHA_API_KEY=${env.IASTUDIO_WAHA_API_KEY}`,
    'WHATSAPP_DEFAULT_ENGINE=WEBJS',
    'WAHA_PRINT_QR=False',
    'WAHA_DASHBOARD_ENABLED=False',
    'WHATSAPP_SWAGGER_ENABLED=False',
    'WAHA_EVENTS_DOWNLOAD_MEDIA=True',
    'WAHA_API_DOWNLOAD_MEDIA=True',
    'WAHA_WORKER_RESTART_SESSIONS=True',
  ];
}

function inspectContainer(name) {
  try { return JSON.parse(exec('docker', ['inspect', name], { quiet: true }))[0]; }
  catch { return undefined; }
}

function runContainer(env, name, volume) {
  const args = [
    'run', '-d', '--name', name, '--restart', 'unless-stopped',
    '-p', `127.0.0.1:${env.IASTUDIO_WAHA_PORT}:3000`,
    '--add-host', 'host.docker.internal:host-gateway',
    '-v', `${volume}:/app/.sessions`,
  ];
  for (const value of expectedEnvironment(env)) args.push('-e', value);
  args.push(env.IASTUDIO_WAHA_IMAGE);
  exec('docker', args);
}

function ensureContainer(env) {
  const name = `${env.appId}-waha`;
  const volume = `${env.appId}-waha-sessions`;
  exec('docker', ['pull', env.IASTUDIO_WAHA_IMAGE]);
  const current = inspectContainer(name);
  const currentEnv = new Set(current?.Config?.Env || []);
  const binding = current?.HostConfig?.PortBindings?.['3000/tcp']?.[0];
  const mustReplace = current && (
    current.Config?.Image !== env.IASTUDIO_WAHA_IMAGE ||
    binding?.HostPort !== env.IASTUDIO_WAHA_PORT ||
    expectedEnvironment(env).some((value) => !currentEnv.has(value))
  );
  if (mustReplace) exec('docker', ['rm', '-f', name]);
  if (!current || mustReplace) runContainer(env, name, volume);
  else if (!current.State?.Running) exec('docker', ['start', name]);
  return name;
}

async function waitUntilReady(env) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(`${env.IASTUDIO_WAHA_URL}/api/sessions?all=true`, {
        headers: { 'X-Api-Key': env.IASTUDIO_WAHA_API_KEY, Accept: 'application/json' },
        signal: AbortSignal.timeout(2_000),
      });
      if (response.ok) return;
    } catch { /* o container ainda está iniciando */ }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error('o container WAHA não ficou saudável em 60 segundos');
}

async function main() {
  const optional = process.argv.includes('--optional');
  if (process.platform !== 'linux' || process.getuid?.() !== 0) {
    if (optional) return;
    throw new Error('o provisionamento WAHA exige Linux/root');
  }
  const env = ensureEnvironment();
  ensureDocker(process.argv.includes('--install-docker'));
  const name = ensureContainer(env);
  await waitUntilReady(env);
  console.log(`WAHA local pronto (${name}); sessões preservadas em volume Docker.`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Falha ao provisionar WAHA: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { DEFAULT_IMAGE, parseEnv, safeName };
