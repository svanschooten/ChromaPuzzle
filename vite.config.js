import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Everything (Vue, JSZip, CSS) is inlined so the build output is one
// self-contained index.html that runs straight off the filesystem.
export default defineConfig({
  base: './',
  plugins: [vue(), viteSingleFile()],
  build: {
    target: 'es2020',
    assetsInlineLimit: 100 * 1024 * 1024,
    chunkSizeWarningLimit: 4096,
  },
});
