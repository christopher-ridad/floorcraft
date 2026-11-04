import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import preact from '@preact/preset-vite';
import { defineConfig, type Plugin } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * Stamps the service worker with a hash of the built page, so each release is a new service
 * worker version and installed apps can offer to reload into it.
 */
function stampServiceWorker(): Plugin {
  let outDir = 'dist';
  return {
    name: 'stamp-service-worker',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      const page = readFileSync(join(outDir, 'index.html'));
      const version = createHash('sha256').update(page).digest('hex').slice(0, 12);
      const workerPath = join(outDir, 'sw.js');
      writeFileSync(
        workerPath,
        readFileSync(workerPath, 'utf8').replace('__BUILD_VERSION__', version),
      );
    },
  };
}

// Builds one self-contained dist/index.html (plus the manifest, icons and service worker from
// public/), served as a static site.
export default defineConfig({
  base: './',
  plugins: [preact(), viteSingleFile(), stampServiceWorker()],
});
