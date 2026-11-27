// Paginile de marcă din catalog (/produse/<slug>/), după prima măsurătoare ChatGPT din 18.11.2026: la „Cine vinde
// MASCOT/Sir Safety în România?” You Protect nu apărea. Faptele despre mărci sunt doar cele de pe site-ul oficial al
// producătorului (sursa e în `source`, verificată pe 19.11.2026). Despre You Protect scriem doar ce e adevărat: vinde
// produsele mărcii firmelor din România. NU „distribuitor autorizat” sau „oficial”: nu avem acest statut documentat.
// Modelele, categoriile și certificările se generează din fișele de produs.

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
  /** Id-ul unei poze din src/data/poze-actiune.json, afișată lângă antet. */
  photo?: string;
}

export const MIN_PRODUCTS_FOR_BRAND_PAGE = 2;

export const BRAND_PAGES: BrandPage[] = [
  {
    brand: 'MASCOT®',
    slug: 'mascot',
    photo: 'M04',
    name: 'MASCOT',
    heading: 'MASCOT: haine de lucru și încălțăminte de protecție pentru firme',
    title: 'MASCOT în România: haine de lucru pentru firme',
    about:
      'MASCOT e o firmă daneză, fondată în 1982, cu sediul la vest de Silkeborg, în Danemarca. Face haine de lucru, îmbrăcăminte de protecție și încălțăminte de protecție și are fabrici proprii în Vietnam și Laos.',
    source: { label: 'mascotworkwear.com', url: 'https://mascotworkwear.com/about-mascot/' },
  },
  {
    brand: 'Sir Safety System',
    slug: 'sir-safety',
    photo: 'S01',
    name: 'Sir Safety',
    heading: 'Sir Safety: haine de lucru și echipamente de protecție pentru firme',
    title: 'Sir Safety în România: echipamente de protecție',
    about:
      'Sir Safety System e o firmă italiană cu sediul în Assisi, pornită în 1979 de Gino Sirci. Face haine de lucru și echipamente de protecție, inclusiv încălțăminte de protecție.',
    source: { label: 'sirsafety.com', url: 'https://sirsafety.com/about-us' },
  },
  {
    brand: 'Portwest',
    slug: 'portwest',
    photo: 'P04',
    name: 'Portwest',
    heading: 'Portwest: haine de lucru și echipamente de protecție pentru firme',
    title: 'Portwest în România: echipamente de protecție',
    about:
      'Portwest e o firmă de familie fondată în 1904, condusă azi de a treia generație a familiei Hughes. Face haine de lucru, îmbrăcăminte de protecție și echipamente de protecție, are fabrici proprii în Bangladesh, Myanmar, Italia și Albania și vinde în peste 130 de țări.',
    source: { label: 'portwest.com', url: 'https://portwest.com/market/aboutus' },
  },
];

/** Paginile de marcă care se publică: cele cu cel puțin MIN_PRODUCTS_FOR_BRAND_PAGE produse publicate. */
export function activeBrandPages(products: { supplier: { brand: string } }[]): BrandPage[] {
  return BRAND_PAGES.filter(
    (page) => products.filter((p) => p.supplier.brand === page.brand).length >= MIN_PRODUCTS_FOR_BRAND_PAGE,
  );
}

/** Descrierea din Google. Fără numărul de modele (owner, 21.11.2026). */
export function brandDescription(page: BrandPage): string {
  return `Produse ${page.name} pentru firme, cu certificările fiecărui model. Ofertă, testare și logo de la You Protect, Satu Mare.`;
}
