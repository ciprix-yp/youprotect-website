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
  url: 'https://legislatie.just.ro/Public/DetaliiDocument/249634',
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
      { label: 'MASCOT: EN ISO 20345', url: 'https://mascotworkwear.com/en/en-iso-20345' },
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
    title: 'EN ISO 20471: ce clasă de vizibilitate îți trebuie',
    description:
      'Clasele 1, 2 și 3 din EN ISO 20471, suprafețele minime de material fluorescent și reflectorizant și ce clasă se recomandă pentru lucru lângă drum.',
    heading: 'EN ISO 20471: ce clasă de vizibilitate îți trebuie lângă drum',
    summary:
      'Ce înseamnă clasele 1, 2 și 3, ce suprafețe minime cere fiecare, cum ajungi la clasa 3 cu un set și ce clasă se recomandă pentru lucru lângă trafic.',
    categories: ['reflectorizante'],
    published: '2026-11-19',
    updated: '2026-11-19',
    sources: [
      {
        label: 'Centexbel: îmbrăcămintea de avertizare după EN ISO 20471:2013+A1:2016',
        url: 'https://www.centexbel.be/en/problem-solving/testing/high-visibility-clothing-according-en-iso-204712013a12016',
      },
      { label: 'MASCOT: EN ISO 20471', url: 'https://mascotworkwear.com/en/en-iso-20471' },
      HG_1048,
    ],
  },
  {
    slug: 'cost-echipament-protectie-muncitor',
    title: 'Cât costă echipamentul de protecție pe muncitor',
    description:
      'Ce echipament de protecție poate cere un șantier, cine îl plătește și cum calculezi costul pe an și pe zi de purtare pentru fiecare muncitor din echipă.',
    heading: 'Cât costă echipamentul de protecție pentru un muncitor din construcții',
    summary:
      'Ce echipament poate fi necesar pe un șantier, cine îl plătește și cum calculezi costul pe an și pe zi de purtare, cu prețurile tale.',
    categories: [],
    published: '2026-11-19',
    updated: '2026-11-19',
    sources: [HG_1048],
  },
  {
    slug: 'haine-de-lucru-care-rezista',
    title: 'Cum alegi haine de lucru care rezistă mai mult',
    description:
      'Ce verifici ca hainele de lucru ale echipei să reziste: spălarea industrială după EN ISO 15797, țesătura și gramajul, întăriturile și ce certifică OEKO-TEX®.',
    heading: 'Cum alegi haine de lucru care rezistă la purtare și la spălare',
    summary:
      'Cum verifici dacă hainele rezistă la spălarea industrială, ce îți spun țesătura, gramajul și întăriturile și ce nu-ți spune eticheta OEKO-TEX®.',
    categories: ['pantaloni', 'geci-jachete', 'tricouri-polo', 'bluze-hanorace'],
    published: '2026-11-20',
    updated: '2026-11-20',
    sources: [
      {
        label: 'EVS: EN ISO 15797:2018, procedeele de spălare industrială pentru testarea hainelor de lucru',
        url: 'https://www.evs.ee/en/evs-en-iso-15797-2018',
      },
      { label: 'MASCOT: ProWash® și EN ISO 15797', url: 'https://www.mascotworkwear.com/en/prowash' },
      { label: 'MASCOT: categoriile de spălare și întreținere industrială', url: 'https://www.mascotworkwear.com/en/care' },
      { label: 'MASCOT: materialele hainelor de lucru', url: 'https://www.mascotworkwear.com/en/fabrics' },
      { label: 'MASCOT: întărituri din CORDURA®', url: 'https://www.mascotworkwear.com/en/cordura' },
      {
        label: 'MASCOT: cum faci hainele de lucru să țină mai mult',
        url: 'https://www.mascotworkwear.com/en/make-your-workwear-last-longer',
      },
      { label: 'OEKO-TEX®: STANDARD 100', url: 'https://www.oeko-tex.com/en/our-standards/oeko-tex-standard-100' },
      {
        label: 'EVS: EN ISO 13688:2013, cerințe generale pentru îmbrăcămintea de protecție',
        url: 'https://www.evs.ee/en/evs-en-iso-13688-2013',
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
