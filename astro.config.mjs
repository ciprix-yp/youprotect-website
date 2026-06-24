import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  integrations: [
    tailwind(),
    react(),
    sitemap({
      // Nu lista paginile noindex (LP-uri) sau de confirmare în sitemap
      filter: (page) => !page.includes('/lp/') && !page.includes('/confirmare'),
    })
  ],
  output: 'static',
  site: 'https://youprotect.ro'
});
