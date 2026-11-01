import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

// GitHub Pages serves the site under the repository's name.
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? '/around-to-table_study/' : '/',
  plugins: [vue(), tailwindcss()],
}));
