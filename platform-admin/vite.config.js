import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

// Versao exibida (barra lateral) = a tag REAL do release. O changelog usa uma
// secao "Não publicado", portanto seu primeiro titulo versionado pode ser
// antigo; no build de release, a tag atual do Git e a fonte confiavel.
const here = fileURLToPath(new URL('.', import.meta.url));
function resolveAppVersion() {
  try {
    return execFileSync('git', ['describe', '--tags', '--exact-match'], {
      cwd: here + '..', encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim().replace(/^v/, '');
  } catch { /* build local sem tag: usa o changelog abaixo */ }
  try {
    const changelog = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf-8');
    const m = changelog.match(/(?:^##\s+v|Release coordenada v)(\d+\.\d+\.\d+)/m);
    if (m) return m[1];
  } catch { /* segue pro fallback */ }
  try {
    const pkg = JSON.parse(readFileSync(here + 'package.json', 'utf-8'));
    return pkg.version || '0.0.0';
  } catch { return '0.0.0'; }
}
const appVersion = resolveAppVersion();

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        // Não existe mais um pedaço só de ícones: eles vêm do catálogo do DS,
        // que chega como fonte JSX dentro do `@studio-ux-ds/react` — Vite trata
        // como código do app, não como dependência estável para separar.
        //
        // O `vendor-icons: ['lucide-react']` que morava aqui **derrubou o build
        // da v0.10.22**: `manualChunks` nomeia um módulo de ENTRADA, então tirar
        // a dependência do `package.json` sem tirar esta linha faz o Rollup
        // abortar com "Could not resolve entry module". A lição: ao remover uma
        // dependência, varrer também a CONFIGURAÇÃO DE BUILD — `src/` e
        // `package.json` limpos não bastam.
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-http': ['axios'],
        },
      },
    },
  },
});
