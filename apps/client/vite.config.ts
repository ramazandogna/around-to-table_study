import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    // three.js is large; it is cached separately from our own code.
    chunkSizeWarningLimit: 800,
    rolldownOptions: {
      output: {
        codeSplitting: { groups: [{ name: 'three', test: /node_modules[\\/]three/ }] },
      },
    },
  },
  server: {
    // During development the Worker runs on wrangler's default port.
    proxy: { '/api': { target: 'http://localhost:8787', ws: true } },
  },
});
