import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'fs';

// Versao exibida (barra lateral) = a versao REAL do release. O CHANGELOG.md da
// raiz e a fonte da verdade (primeiro "## vX.Y.Z"); no build o repo ja esta na
// tag certa. O package.json ficava preso em 0.1.0 e mostrava versao errada.
function resolveAppVersion() {
  try {
    const changelog = readFileSync('../CHANGELOG.md', 'utf-8');
    const m = changelog.match(/^##\s+v(\d+\.\d+\.\d+)/m);
    if (m) return m[1];
  } catch { /* segue pro fallback */ }
  try {
    const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));
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
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-icons': ['lucide-react'],
          'vendor-http': ['axios'],
        },
      },
    },
  },
});
