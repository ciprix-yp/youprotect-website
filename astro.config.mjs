import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import { fetchGoogleReviews } from './scripts/fetch-google-reviews.mjs';

// Recenziile de 4–5 stele de pe Google se preiau la fiecare build, înainte ca paginile să fie generate.
const googleReviews = {
  name: 'recenzii-google',
  hooks: {
    'astro:config:setup': async ({ command, logger }) => {
      if (command === 'build') logger.info(await fetchGoogleReviews());
    },
  },
};

// Tailwind rulează prin postcss.config.mjs.
export default defineConfig({
  // Astro 7 a schimbat implicitul în 'jsx', care șterge spațiile dintre elementele inline
  // scrise pe rânduri diferite. Păstrăm comportamentul de până acum ca să nu se lipească cuvinte.
  compressHTML: true,
  // Pagina se descarcă de cum pui mouse-ul pe link (sau focusul, din tastatură): la click apare imediat, iar tranziția
  // dintre pagini (global.css) pornește fără așteptare. Doar HTML-ul paginii, fără să o randeze (fluiditate, 20.11.2026).
  prefetch: { prefetchAll: true, defaultStrategy: 'hover' },
  integrations: [
    googleReviews,
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
