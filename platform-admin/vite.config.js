import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'fs';

// Le a versao do package.json em build time e injeta como global __APP_VERSION__.
const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));
const appVersion = pkg.version || '0.0.0';

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
