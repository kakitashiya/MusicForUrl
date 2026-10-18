import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = fileURLToPath(new URL('.', import.meta.url));
const rootPackage = JSON.parse(readFileSync(path.join(here, '..', 'package.json'), 'utf8'));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.join(here, 'src') },
  },
  define: {
    // 版本号在构建时注入，省掉运行时再去请求 app-meta.json
    __APP_VERSION__: JSON.stringify(rootPackage.version),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    // 本地开发时把 /api 交给 wrangler dev
    proxy: { '/api': { target: 'http://127.0.0.1:8787', changeOrigin: true } },
  },
});
