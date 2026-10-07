import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    rollupOptions: {
      // El juego en la raíz; el banco de combate y la prueba de estilo HD-2D aparte.
      input: { main: 'index.html', combat: 'combat.html', style: 'style.html' },
      output: {
        // Las librerías gráficas en sus propios chunks: cambian poco y se cachean aparte.
        manualChunks: { pixi: ['pixi.js'], three: ['three'] },
      },
    },
  },
  test: { environment: 'node' },
} as never);
