export default {
  // Efectele de hover (zoom, culori) doar pe dispozitivele cu mouse: pe telefon, o atingere lăsa cardul „agățat” în
  // starea de hover (fluiditate, 20.11.2026).
  future: { hoverOnlyWhenSupported: true },
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'yp-black': '#0A0A0A',
        'yp-yellow': '#E3FC02',
        'yp-green': '#0F766E',
        'yp-gray': '#2E2E2E',
        'yp-white': '#FFFFFF',
        // Suprafețele cardurilor (un pas peste fundal) și fondul cald al pozelor de produs (design premium, 20.11.2026).
        'yp-surface': '#121212',
        'yp-surface-2': '#181818',
        'yp-well': '#EFEEEA',
      },
      boxShadow: {
        // Margine luminoasă fină sus + umbră adâncă: cardul pare ridicat de pe fundal.
        card: 'inset 0 1px 0 0 rgba(255,255,255,0.06), 0 24px 48px -28px rgba(0,0,0,0.95)',
        'card-hover': 'inset 0 1px 0 0 rgba(255,255,255,0.09), 0 36px 64px -30px rgba(0,0,0,1), 0 0 0 1px rgba(227,252,2,0.25)',
      },
      // Curbele de mișcare ale site-ului (fluiditate, 20.11.2026; după skill-ul apple-design / review-animations):
      // out-strong pentru ce apare sau răspunde la o acțiune, drawer pentru ce se mută pe ecran (curba iOS).
      transitionTimingFunction: {
        'out-strong': 'cubic-bezier(0.23, 1, 0.32, 1)',
        drawer: 'cubic-bezier(0.32, 0.72, 0, 1)',
      },
      fontFamily: {
        'heading': ['Montserrat', 'sans-serif'],
        'body': ['"YP Text"', 'sans-serif'],
        'accent': ['Playfair Display', 'serif'],
      },
    },
  },
  plugins: [],
}
