import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        // Three.js en su propio chunk: cambia poco y se cachea aparte.
        manualChunks: { three: ['three'] },
      },
    },
  },
  test: { environment: 'node' },
} as never);
