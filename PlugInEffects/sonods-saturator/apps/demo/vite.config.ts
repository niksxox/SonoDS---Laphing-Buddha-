import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@sonods/sat-ui': path.resolve(__dirname, '../../packages/sat-ui/src/index.ts'),
      '@sonods/sat-engine': path.resolve(__dirname, '../../packages/sat-engine/src/index.ts'),
    },
  },
  server: {
    port: 3001,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
});
