import preact from '@preact/preset-vite';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Builds one self-contained dist/index.html, so the app can be published as a Claude artifact
// or hosted as a single static file.
export default defineConfig({
  root: 'src',
  base: './',
  plugins: [preact(), viteSingleFile()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
});
