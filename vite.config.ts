import { defineConfig } from 'vite';

// Op GitHub Pages staat de app onder /<repo>/; de workflow geeft dat mee als BASE.
export default defineConfig({
  base: process.env.BASE ?? '/',
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
  build: {
    rollupOptions: { input: { index: 'index.html', les: 'les.html' } },
  },
});
