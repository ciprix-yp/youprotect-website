// Paginile de marcă din catalog (/produse/<slug>/), după prima măsurătoare ChatGPT din 18.11.2026: la „Cine vinde
// MASCOT/Sir Safety în România?” You Protect nu apărea. Faptele despre mărci sunt doar cele de pe site-ul oficial al
// producătorului (sursa e în `source`, verificată pe 19.11.2026). Despre You Protect scriem doar ce e adevărat: vinde
// produsele mărcii firmelor din România. NU „distribuitor autorizat” sau „oficial”: nu avem acest statut documentat.
// Modelele, categoriile și certificările se generează din fișele de produs.
import { modelsLabel } from './catalog-categories.ts';

export interface BrandPage {
  /** Valoarea din `supplier.brand` a fișelor („MASCOT®”). */
  brand: string;
  slug: string;
  /** Numele de afișat, fără ®. */
  name: string;
  /** H1 și numele din breadcrumb. */
  heading: string;
  /** Titlul din Google; layout-ul adaugă „ | You Protect”. */
  title: string;
  /** Cine e producătorul, din sursa oficială. */
  about: string;
  source: { label: string; url: string };
}

export const MIN_PRODUCTS_FOR_BRAND_PAGE = 2;

export const BRAND_PAGES: BrandPage[] = [
  {
    brand: 'MASCOT®',
    slug: 'mascot',
    name: 'MASCOT',
    heading: 'MASCOT: haine de lucru și încălțăminte de protecție pentru firme',
    title: 'MASCOT în România: haine de lucru pentru firme',
    about:
      'MASCOT e o firmă daneză, fondată în 1982, cu sediul la vest de Silkeborg, în Danemarca. Face haine de lucru, îmbrăcăminte de protecție și încălțăminte de protecție și are fabrici proprii în Vietnam și Laos.',
    source: { label: 'mascotworkwear.com', url: 'https://mascotworkwear.com/en/about-mascot' },
  },
  {
    brand: 'Sir Safety System',
    slug: 'sir-safety',
    name: 'Sir Safety',
    heading: 'Sir Safety: haine de lucru și echipamente de protecție pentru firme',
    title: 'Sir Safety în România: echipamente de protecție',
    about:
      'Sir Safety System e o firmă italiană cu sediul în Assisi, pornită în 1979 de Gino Sirci. Face haine de lucru și echipamente de protecție, inclusiv încălțăminte de protecție.',
    source: { label: 'sirsafety.com', url: 'https://sirsafety.com/about-us' },
  },
];

/** Paginile de marcă care se publică: cele cu cel puțin MIN_PRODUCTS_FOR_BRAND_PAGE produse publicate. */
export function activeBrandPages(products: { supplier: { brand: string } }[]): BrandPage[] {
  return BRAND_PAGES.filter(
    (page) => products.filter((p) => p.supplier.brand === page.brand).length >= MIN_PRODUCTS_FOR_BRAND_PAGE,
  );
}

export function brandPageFor(brand: string): BrandPage | undefined {
  return BRAND_PAGES.find((b) => b.brand === brand);
}

/** Descrierea din Google: numărul de modele vine din produse. */
export function brandDescription(page: BrandPage, count: number): string {
  return `Produse ${page.name} pentru firme: ${modelsLabel(count)} în catalog, cu certificările fiecărui model. Ofertă, testare și logo de la You Protect, Satu Mare.`;
}
