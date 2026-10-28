import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  // Relative paths so the site works at https://<user>.github.io/<repo>/
  base: './',
  plugins: [react(), tailwindcss()],
  // p5 and three are big libraries; their size is expected.
  build: { chunkSizeWarningLimit: 1200 },
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
});
