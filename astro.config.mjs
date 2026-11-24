import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import vue from '@astrojs/vue';
import { linoDocs } from 'lino-ui/vite';
import {linoSoundLevel} from './scripts/lino-sound-level.mjs';

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  integrations: [vue()],
  server: { host: '127.0.0.1', port: 4321 },
  // Preserve the loopback Host in Request.url so same-origin POSTs work.
  security: { allowedDomains: [{ protocol: 'http', hostname: '127.0.0.1' }, { protocol: 'http', hostname: 'localhost' }] },
  vite: { plugins: [linoDocs(),linoSoundLevel()], optimizeDeps:{exclude:['lino-ui/sounds']}, ssr: { external: ['better-sqlite3'], noExternal: ['lino-ui'] } },
});
