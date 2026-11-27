// Ghidurile de la /ghiduri/, pentru întrebările la care You Protect nu apărea în prima măsurătoare ChatGPT (18.11.2026,
// scripts/seo/ai-prompts.json). Reguli de adevăr (D-2026-11-19-03):
//   - fiecare fapt despre un standard sau o lege are sursa în `sources` și pe pagină;
//   - fără prețuri și fără cifre de cost: le dăm în ofertă, iar calculatorul lucrează cu prețurile vizitatorului;
//   - recomandările de clasă sunt atribuite cui le face (de exemplu Centexbel); alegerea o face angajatorul, după
//     evaluarea riscurilor (HG nr. 1.048/2006, art. 14).
// Modelele din catalog pomenite în ghiduri se generează din fișele de produs.
import type { CategoryKey } from './catalog-taxonomy.ts';

export interface GuideSource {
  label: string;
  url: string;
}

export interface Guide {
  slug: string;
  /** Titlul din Google; layout-ul adaugă „ | You Protect”. */
  title: string;
  description: string;
  /** H1. */
  heading: string;
  /** Eticheta scurtă din breadcrumb, când titlul e lung (implicit titlul). */
  breadcrumb?: string;
  /** Textul de pe pagina /ghiduri/ și din legăturile de pe paginile de categorie. */
  summary: string;
  /** Categoriile din catalog la care ghidul e relevant: paginile lor trimit la el. */
  categories: CategoryKey[];
  /** Data publicării și a ultimei verificări a surselor (AAAA-LL-ZZ). */
  published: string;
  updated: string;
  sources: GuideSource[];
}

export const GUIDES_HREF = '/ghiduri/';

const HG_1048: GuideSource = {
  label: 'Portal Legislativ: HG nr. 1.048/2006 privind utilizarea echipamentelor individuale de protecție, republicată',
  url: 'https://legislatie.just.ro/Public/DetaliiDocument/253674',
};

export const GUIDES: Guide[] = [
  {
    slug: 's1p-sau-s3',
    title: 'S1P vs S3: diferența la încălțămintea de protecție',
    description:
      'S3 are tot ce are S1P, plus fața rezistentă la apă și talpă cu crampoane. Când alegi fiecare clasă și ce înseamnă S3S, S3L și S7 după EN ISO 20345:2022.',
    heading: 'S1P sau S3: care e diferența la încălțămintea de protecție',
    breadcrumb: 'S1P sau S3',
    summary:
      'S3 are tot ce are S1P, plus fața rezistentă la apă și talpă cu crampoane. Când alegi fiecare clasă și ce înseamnă S3S, S3L și S7.',
    categories: ['incaltaminte'],
    published: '2026-11-19',
    updated: '2026-11-27',
    sources: [
      { label: 'MASCOT: EN ISO 20345', url: 'https://mascotworkwear.com/about-mascot/certifications/en-iso-20345/' },
      { label: 'Atlas: EN ISO 20345:2022', url: 'https://www.atlasschuhe.de/en/technology/en-iso-203452022.html' },
      { label: 'Safety Jogger: EN ISO 20345:2022', url: 'https://www.safetyjogger.com/en/eu/technical/iso_20345_2022' },
      {
        label: 'Ejendals (Jalas): EN ISO 20345, cerințe și metode de testare',
        url: 'https://www.ejendals.com/no/jalas/sikkerhetsstandarder-fottoy/en-iso-20345--krav-til-vernesko/',
      },
      HG_1048,
    ],
  },
  {
    slug: 'clase-vizibilitate-en-iso-20471',
    title: 'EN ISO 20471: clasa 2 sau clasa 3 lângă drum',
    description:
      'Clasa 2 sau clasa 3 din EN ISO 20471: ce suprafețe minime cere fiecare, ce recomandă Centexbel lângă drum și cum ajungi la clasa 3 cu o haină sau cu un set.',
    heading: 'EN ISO 20471: ce clasă de vizibilitate îți trebuie lângă drum',
    breadcrumb: 'Clase de vizibilitate',
    summary:
      'Clasa 3 e cea mai vizibilă. Ce suprafețe cere fiecare clasă, ce recomandă Centexbel lângă drum și cum ajungi la clasa 3 cu un set.',
    categories: ['reflectorizante'],
    published: '2026-11-19',
    updated: '2026-11-27',
    sources: [
      {
        label: 'Centexbel: îmbrăcămintea de avertizare după EN ISO 20471:2013+A1:2016',
        url: 'https://www.centexbel.be/en/problem-solving/testing/high-visibility-clothing-according-en-iso-204712013a12016',
      },
      { label: 'MASCOT: EN ISO 20471', url: 'https://mascotworkwear.com/about-mascot/certifications/en-iso-20471/' },
      HG_1048,
    ],
  },
  {
    slug: 'cost-echipament-protectie-muncitor',
    title: 'Cât costă echipamentul de protecție pe muncitor',
    description:
      'Costul pe an al unui muncitor: prețul fiecărei piese înmulțit cu bucățile primite într-un an, plus administrarea. Ce cere legea pe șantier și cine plătește.',
    heading: 'Cât costă echipamentul de protecție pentru un muncitor din construcții',
    breadcrumb: 'Costul pe muncitor',
    summary:
      'Costul pe an e prețul fiecărei piese înmulțit cu bucățile primite într-un an, plus administrarea. Ce poate cere un șantier și cine plătește.',
    categories: [],
    published: '2026-11-19',
    updated: '2026-11-27',
    sources: [HG_1048],
  },
  {
    slug: 'haine-de-lucru-care-rezista',
    title: 'Cum alegi haine de lucru rezistente',
    description:
      'Haine de lucru rezistente: cine le spală (acasă sau la spălătorie, după EN ISO 15797), țesătura, întăriturile și ce îți spune eticheta OEKO-TEX®.',
    heading: 'Cum alegi haine de lucru care rezistă la purtare și la spălare',
    breadcrumb: 'Haine de lucru rezistente',
    summary:
      'Cine le spală hotărăște primul criteriu: spălarea industrială după EN ISO 15797. Apoi țesătura, întăriturile, cusăturile și ce nu-ți spune eticheta OEKO-TEX®.',
    categories: ['pantaloni', 'geci-jachete', 'tricouri-polo', 'bluze-hanorace'],
    published: '2026-11-20',
    updated: '2026-11-27',
    // MASCOT a scos de pe site-ul nou paginile despre ProWash®, categoriile de întreținere, materiale și întreținere
    // (404 pe 27.11.2026); le citez din copiile arhivate. scripts/seo/check-sources.mjs verifică lunar toate sursele.
    sources: [
      {
        label: 'EVS: EN ISO 15797:2018, procedeele de spălare industrială pentru testarea hainelor de lucru',
        url: 'https://www.evs.ee/en/evs-en-iso-15797-2018',
      },
      {
        label: 'MASCOT: ProWash® și EN ISO 15797 (copie arhivată, iunie 2026)',
        url: 'https://web.archive.org/web/20260616185607/https://www.mascotworkwear.com/en/prowash',
      },
      {
        label: 'MASCOT: categoriile de spălare și întreținere industrială (copie arhivată, iulie 2026)',
        url: 'https://web.archive.org/web/20260718211522/https://www.mascotworkwear.com/en/care',
      },
      {
        label: 'MASCOT: materialele hainelor de lucru (copie arhivată, iulie 2026)',
        url: 'https://web.archive.org/web/20260718215423/https://www.mascotworkwear.com/en/fabrics',
      },
      {
        label: 'MASCOT: tehnologiile din hainele de lucru, CORDURA® și Dyneema®',
        url: 'https://mascotworkwear.com/about-mascot/product-knowledge/technologies/',
      },
      {
        label: 'MASCOT: cum faci hainele de lucru să țină mai mult (copie arhivată, aprilie 2026)',
        url: 'https://web.archive.org/web/20260420091124/https://www.mascotworkwear.com/en/make-your-workwear-last-longer',
      },
      { label: 'OEKO-TEX®: STANDARD 100', url: 'https://www.oeko-tex.com/en/our-standards/oeko-tex-standard-100' },
      {
        label: 'EVS: EN ISO 13688:2013+A1:2021, cerințe generale pentru îmbrăcămintea de protecție',
        url: 'https://www.evs.ee/en/evs-en-iso-13688-2013-a1-2021-consolidated',
      },
      HG_1048,
    ],
  },
];

export function guideHref(guide: Guide): string {
  return `${GUIDES_HREF}${guide.slug}/`;
}

export function guideBySlug(slug: string): Guide {
  const guide = GUIDES.find((g) => g.slug === slug);
  if (!guide) throw new Error(`Ghidul „${slug}” nu există în src/lib/guides.ts.`);
  return guide;
}

export function guidesForCategory(key: CategoryKey): Guide[] {
  return GUIDES.filter((g) => g.categories.includes(key));
}

/** „19 noiembrie 2026”, în ora României (build-ul rulează în UTC). */
export function formatGuideDate(iso: string): string {
  return new Intl.DateTimeFormat('ro-RO', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Bucharest',
  }).format(new Date(`${iso}T12:00:00Z`));
}

/**
 * Clasa EN ISO 20345 din certificările unei fișe („S3S”, „S7S”, „S1PL”), sau null.
 * Codurile vin din fișe: „S3S” sau „EN ISO 20345:2022 S7S FO SR”.
 */
export function footwearClass(certifications: { code: string }[]): string | null {
  for (const c of certifications) {
    const m = c.code.match(/\b(SB|S[1-7](?:P[LS]?|[LS])?)\b/);
    if (m) return m[1];
  }
  return null;
}

/** Clasa EN ISO 20471 din certificările unei fișe („EN ISO 20471, clasa 3” → 3), sau null. */
export function hiVisClass(certifications: { code: string }[]): number | null {
  for (const c of certifications) {
    const m = c.code.match(/EN ISO 20471[^0-9]*clasa\s*([123])\b/i);
    if (m) return Number(m[1]);
  }
  return null;
}
