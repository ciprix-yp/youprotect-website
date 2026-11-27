// Preseturile de gradient ale eroului homepage-ului (poza rotativă, vezi src/components/home/HeroPhotoSet.astro).
// Fiecare poză din `eroul.gradient` (src/data/poze-actiune.json) alege un preset după cât contrast cere titlul de pe ea.
//
// Clasele Tailwind sunt LITERALE, scrise întregi aici, ca scanarea JIT (@source din src/styles/global.css: src/**/*.ts) să le vadă;
// nu se compun din bucăți (cu interpolare), că nu ar mai ajunge în CSS. Gradientul de telefon se aplică pe blocul poză 4:5
// (titlul începe peste ultimul sfert al pozei), cel de desktop pe poza de fundal a întregii secțiuni.
//   - standard: exact gradientele eroului de până acum (S02 arată identic).
//   - mediu: ca „standard” pe telefon, puțin mai întunecat pe desktop (via 75%, la capăt 40%): pentru pozele la care titlul de
//     pe desktop e la limita de 4,5:1 (măsurat pe linii, vezi D-2026-11-26-04).
//   - puternic / foarte-puternic: pentru pozele luminoase sau aglomerate în zona titlului.
export const HERO_GRADIENTS = {
  standard: {
    telefon: 'from-yp-black from-5% via-yp-black/70 via-40% to-transparent',
    desktop: 'from-yp-black via-yp-black/70 to-yp-black/30',
  },
  mediu: {
    telefon: 'from-yp-black from-5% via-yp-black/70 via-40% to-transparent',
    desktop: 'from-yp-black via-yp-black/75 to-yp-black/40',
  },
  puternic: {
    telefon: 'from-yp-black from-10% via-yp-black/80 via-50% to-yp-black/10',
    desktop: 'from-yp-black via-yp-black/80 to-yp-black/50',
  },
  'foarte-puternic': {
    telefon: 'from-yp-black from-15% via-yp-black/90 via-55% to-yp-black/25',
    desktop: 'from-yp-black via-yp-black/90 to-yp-black/70',
  },
} as const;

export type HeroGradient = keyof typeof HERO_GRADIENTS;
