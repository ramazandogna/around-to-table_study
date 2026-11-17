import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // The Durable Objects run under plain Node in tests, on a stand-in base class.
      'cloudflare:workers': fileURLToPath(
        new URL('./test/support/cloudflare-workers.ts', import.meta.url),
      ),
    },
  },
});
