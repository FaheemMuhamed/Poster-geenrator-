import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import fs from 'node:fs';

// Dev-only: lets capture.html save preview clips and example posters into public/.
// Only active under `npm run dev`; it is never part of the built site.
function captureEndpoint() {
  const ALLOWED = new Set(['previews', 'examples', 'samples']);
  return {
    name: 'capture-endpoint',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__capture', (req, res) => {
        const url = new URL(req.url, 'http://x');
        const dir = url.searchParams.get('dir');
        const name = path.basename(url.searchParams.get('name') || '');
        if (req.method !== 'POST' || !ALLOWED.has(dir) || !/^[\w.-]+$/.test(name)) {
          res.statusCode = 400;
          return res.end('bad request');
        }
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => {
          const out = path.resolve(import.meta.dirname, 'public', dir);
          fs.mkdirSync(out, { recursive: true });
          fs.writeFileSync(path.join(out, name), Buffer.concat(chunks));
          res.end('ok');
        });
      });
    },
  };
}

export default defineConfig({
  // Relative paths so the site works at https://morva-studio.com/ and at https://<user>.github.io/<repo>/
  base: './',
  plugins: [react(), tailwindcss(), captureEndpoint()],
  // p5 and three are big libraries; their size is expected.
  build: { chunkSizeWarningLimit: 1200 },
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
});
