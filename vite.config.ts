import { defineConfig } from 'vite';

// Relative base is REQUIRED: Yandex Games and CrazyGames serve the build from a
// nested path / sandboxed iframe, so absolute "/assets/..." URLs would 404.
export default defineConfig({
  base: './',
  build: {
    target: 'es2019',
    assetsInlineLimit: 4096,
    chunkSizeWarningLimit: 2048,
    reportCompressedSize: true,
    sourcemap: false,
  },
  server: { host: true, port: 5173, open: false },
  preview: { host: true, port: 4173 },
});
