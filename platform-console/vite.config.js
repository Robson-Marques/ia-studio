import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

// Versao exibida = versao REAL do release (primeiro "## vX.Y.Z" do CHANGELOG da
// raiz). Caminhos resolvidos a partir DESTE arquivo (import.meta.url) — nao
// dependem do diretorio onde o build roda. O package.json ficava preso em 0.1.0.
const here = fileURLToPath(new URL('.', import.meta.url));
function resolveAppVersion() {
  try {
    const changelog = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf-8');
    const m = changelog.match(/^##\s+v(\d+\.\d+\.\d+)/m);
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
    port: 5174,
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
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-icons': ['lucide-react'],
          'vendor-http': ['axios'],
        },
      },
    },
  },
});
