import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';

// Tailwind rulează prin postcss.config.mjs.
export default defineConfig({
  // Astro 7 a schimbat implicitul în 'jsx', care șterge spațiile dintre elementele inline
  // scrise pe rânduri diferite. Păstrăm comportamentul de până acum ca să nu se lipească cuvinte.
  compressHTML: true,
  integrations: [
    react(),
    sitemap({
      // Nu lista paginile noindex (LP-uri) sau de confirmare în sitemap
      filter: (page) =>
        !page.includes('/lp/') && !page.includes('/confirmare') && !page.includes('/preview/'),
    })
  ],
  output: 'static',
  site: 'https://youprotect.ro'
});
