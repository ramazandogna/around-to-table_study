import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    // Phaser alone is ~1.2 MB minified; it is cached separately from our own code.
    chunkSizeWarningLimit: 1500,
    rolldownOptions: {
      output: {
        codeSplitting: { groups: [{ name: 'phaser', test: /node_modules[\\/]phaser/ }] },
      },
    },
  },
  server: {
    // During development the Worker runs on wrangler's default port.
    proxy: { '/api': { target: 'http://localhost:8787', ws: true } },
  },
});
