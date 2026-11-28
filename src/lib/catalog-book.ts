// Catalogul de răsfoit (/catalog/, CAT-004, D-2026-11-28-01): paginile se generează din fișele publicate, în ordinea
// din /produse/ (categoriile din CATEGORIES, apoi numele). Ordinea paginilor: coperta, „Cum lucrăm”, cuprinsul pe
// două pagini, câte un produs pe pagină, contactul. Fără prețuri și fără numărul de produse (D-2026-11-21-03).
import { CATEGORIES, type CategoryKey } from './catalog-taxonomy.ts';

/** Coperta, „Cum lucrăm” și cele două pagini de cuprins: primul produs e pe pagina 5. */
export const FRONT_PAGES = 4;

/** Câte caractere de avantaje încap pe pagina unui produs fără să micșoreze prea mult poza (măsurat la 390 px). */
export const BENEFITS_BUDGET = 170;
/** Cel mult atâtea avantaje pe pagină: restul sunt pe fișa produsului. */
export const BENEFITS_MAX = 2;

/** Pe copertă, câte o poză din categoriile astea; dacă una lipsește, intră prima categorie care nu e deja aleasă. */
export const COVER_CATEGORIES: CategoryKey[] = ['reflectorizante', 'incaltaminte', 'casti-protectie', 'manusi'];

export interface BookEntry {
  id: string;
  data: { name: string; category: CategoryKey; status: string };
}

export interface BookSection<T extends BookEntry> {
  key: CategoryKey;
  label: string;
  /** Pagina primului produs din categorie (numerotarea începe cu coperta, pagina 1). */
  firstPage: number;
  items: T[];
}

const roCollator = new Intl.Collator('ro', { sensitivity: 'base' });
const categoryOrder = Object.keys(CATEGORIES) as CategoryKey[];

/** Produsele publicate, grupate pe categorii, cu pagina la care începe fiecare categorie. */
export function bookSections<T extends BookEntry>(entries: T[]): BookSection<T>[] {
  const published = entries
    .filter((e) => e.data.status === 'published')
    .sort(
      (a, b) =>
        categoryOrder.indexOf(a.data.category) - categoryOrder.indexOf(b.data.category) ||
        roCollator.compare(a.data.name, b.data.name),
    );
  const sections: BookSection<T>[] = [];
  let page = FRONT_PAGES + 1;
  for (const key of categoryOrder) {
    const items = published.filter((e) => e.data.category === key);
    if (items.length === 0) continue;
    sections.push({ key, label: CATEGORIES[key], firstPage: page, items });
    page += items.length;
  }
  return sections;
}

/** Cuprinsul pe două pagini: prima jumătate (rotunjită în sus) pe pagina 3, restul pe pagina 4. */
export function splitContents<T>(sections: T[]): [T[], T[]] {
  const half = Math.ceil(sections.length / 2);
  return [sections.slice(0, half), sections.slice(half)];
}

/**
 * Avantajele de pe pagina produsului: în ordinea din fișă, cât timp încap în buget; cel puțin unul, cel mult
 * BENEFITS_MAX. Așa nu se taie niciun avantaj la jumătate și pagina nu dă pe dinafară.
 */
export function pickBenefits(benefits: string[], budget = BENEFITS_BUDGET, max = BENEFITS_MAX): string[] {
  const picked: string[] = [];
  let used = 0;
  for (const b of benefits) {
    if (picked.length === max) break;
    if (picked.length >= 1 && used + b.length > budget) break;
    picked.push(b);
    used += b.length;
  }
  return picked;
}

/** Produsele de pe copertă: primul din fiecare categorie din COVER_CATEGORIES, completat din celelalte categorii. */
export function coverItems<T extends BookEntry>(sections: BookSection<T>[], count = 4): T[] {
  const preferred = COVER_CATEGORIES.map((key) => sections.find((s) => s.key === key)).filter(
    (s): s is BookSection<T> => s !== undefined,
  );
  const rest = sections.filter((s) => !COVER_CATEGORIES.includes(s.key));
  return [...preferred, ...rest].slice(0, count).map((s) => s.items[0]);
}

/** „noiembrie 2026”: luna ediției, la ora României (build-ul rulează pe UTC). */
export function editionLabel(date: Date): string {
  return new Intl.DateTimeFormat('ro-RO', { month: 'long', year: 'numeric', timeZone: 'Europe/Bucharest' }).format(date);
}
