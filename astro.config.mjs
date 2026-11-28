import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
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

// Scripturile de pe fiecare pagină (BaseLayout, Header, Footer, Analytics) stau în pagină, oricât de mari ar fi. Ca fișier
// separat se descarcă după HTML și pot rula în timpul tranziției dintre pagini (global.css, @view-transition); atunci
// Chrome sare tranziția, iar poza nu mai trece din card în fișa produsului (PR #80 și lista de ofertă, 20.11.2026,
// D-2026-11-20-14). Astro le pune în pagină doar dacă nu importă nimic: un import comun cu alt script le scoate oricum
// (scripts/check-inline-scripts.mjs verifică după build). Restul resurselor păstrează limita Vite de 4 KB.
const LAYOUT_SCRIPT = /\/(BaseLayout|Header|Footer|Analytics)\.astro_astro_type_script_/;
export const inlineLayoutScripts = (filePath) => (LAYOUT_SCRIPT.test(`/${filePath}`) ? true : undefined);

// Tailwind 4 rulează ca plugin Vite (@tailwindcss/vite), fără PostCSS; configurația e în src/styles/global.css.
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
      // Nu lista paginile noindex (LP-uri, catalogul de răsfoit) sau de confirmare în sitemap
      filter: (page) =>
        !page.includes('/lp/') &&
        !page.includes('/confirmare') &&
        !page.includes('/preview/') &&
        !page.endsWith('/catalog/'),
    })
  ],
  output: 'static',
  vite: { plugins: [tailwindcss()], build: { assetsInlineLimit: inlineLayoutScripts } },
  site: 'https://youprotect.ro'
});
