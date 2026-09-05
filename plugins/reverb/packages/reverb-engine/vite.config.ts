import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'SonoDSReverbEngine',
      fileName: 'index',
      formats: ['es', 'cjs'],
    },
  },
});
