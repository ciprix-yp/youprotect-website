// Tailwind 3 rulează prin PostCSS (Vite îl încarcă automat).
// @astrojs/tailwind a fost scos: nu suportă Astro 6+ și injecta a doua oară stilurile de bază.
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
