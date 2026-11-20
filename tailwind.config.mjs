export default {
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
      fontFamily: {
        'heading': ['Montserrat', 'sans-serif'],
        'body': ['"YP Text"', 'sans-serif'],
        'accent': ['Playfair Display', 'serif'],
      },
    },
  },
  plugins: [],
}
