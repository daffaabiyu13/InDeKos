import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Serve the face-api models used for KTP ↔ selfie verification from
// node_modules (dev) and emit them into dist/face-models (build), so the
// feature works self-hosted without a CDN and without committing ~12 MB.
function faceModels() {
  const dir = path.resolve(__dirname, 'node_modules/@vladmandic/face-api/model');
  const files = ['ssd_mobilenetv1_model', 'face_landmark_68_model', 'face_recognition_model']
    .flatMap((n) => [`${n}-weights_manifest.json`, `${n}.bin`]);
  return {
    name: 'indekos-face-models',
    configureServer(server) {
      server.middlewares.use('/face-models', (req, res, next) => {
        const file = String(req.url || '').replace(/^\//, '').split('?')[0];
        if (!files.includes(file)) return next();
        res.setHeader('Content-Type', file.endsWith('.json') ? 'application/json' : 'application/octet-stream');
        fs.createReadStream(path.join(dir, file)).pipe(res);
      });
    },
    generateBundle() {
      for (const file of files) {
        this.emitFile({ type: 'asset', fileName: `face-models/${file}`, source: fs.readFileSync(path.join(dir, file)) });
      }
    },
  };
}

// The dev server proxies /api to the Express backend so the SPA
// and the API can be developed under a single origin.
export default defineConfig({
  plugins: [react(), faceModels()],
  // face-api (±1.3 MB) is a lazy chunk loaded only when a face check runs.
  build: { chunkSizeWarningLimit: 1400 },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
