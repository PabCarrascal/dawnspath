import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    rollupOptions: {
      // El juego en la raíz y el banco de pruebas del combate aparte.
      input: { main: 'index.html', combat: 'combat.html' },
      output: {
        // PixiJS en su propio chunk: cambia poco y se cachea aparte.
        manualChunks: { pixi: ['pixi.js'] },
      },
    },
  },
  test: { environment: 'node' },
} as never);
