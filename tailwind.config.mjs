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
      },
      fontFamily: {
        'heading': ['Montserrat', 'sans-serif'],
        'body': ['Lato', 'sans-serif'],
        'accent': ['Playfair Display', 'serif'],
      },
    },
  },
  plugins: [],
}
