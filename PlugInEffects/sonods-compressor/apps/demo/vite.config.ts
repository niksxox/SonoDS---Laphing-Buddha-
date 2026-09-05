import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@sonods/comp-ui': path.resolve(__dirname, '../../packages/comp-ui/src/index.ts'),
      '@sonods/comp-engine': path.resolve(__dirname, '../../packages/comp-engine/src/index.ts'),
    },
  },
  optimizeDeps: {
    exclude: ['@sonods/comp-ui', '@sonods/comp-engine'],
  },
  server: {
    port: 3002,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
});
