// Paginile de categorie din catalog (/produse/<slug>/), după auditul de cuvinte cheie din 18.11.2026.
// Slug-ul e cuvântul pe care îl caută oamenii („incaltaminte de protectie”). Textele de aici sunt generale; tot ce
// ține de produse (modele, mărci, clase de protecție) se generează din fișele de produs, ca să rămână adevărat
// când se schimbă catalogul.
import type { CategoryKey } from './catalog-taxonomy';

export interface CategoryPage {
  key: CategoryKey;
  slug: string;
  /** H1 și numele din breadcrumb. */
  heading: string;
  /** Titlul din Google; layout-ul adaugă „ | You Protect”. */
  title: string;
  /** Primul paragraf, fără afirmații despre modele anume. */
  intro: string;
  /** Cum se numesc produsele în întrebările frecvente („bocancii și pantofii de protecție”). */
  plural: string;
  /** Se pot personaliza cu logo. Încălțămintea nu: nicio fișă nu are zone de logo de la producător. */
  logo: boolean;
}

// O pagină de categorie apare doar de la două produse publicate în sus: o pagină cu un singur produs ar fi subțire.
export const MIN_PRODUCTS_FOR_CATEGORY_PAGE = 2;

export const CATEGORY_PAGES: CategoryPage[] = [
  {
    key: 'incaltaminte',
    slug: 'incaltaminte-de-protectie',
    heading: 'Încălțăminte de protecție pentru firme',
    title: 'Încălțăminte de protecție pentru firme',
    intro:
      'Bocanci, ghete și pantofi de protecție pentru echipele din construcții, producție și logistică. Mai jos vezi clasa fiecărui model conform EN ISO 20345, așa cum o declară producătorul.',
    plural: 'bocancii, ghetele și pantofii de protecție',
    logo: false,
  },
  {
    key: 'reflectorizante',
    slug: 'imbracaminte-reflectorizanta',
    heading: 'Îmbrăcăminte reflectorizantă pentru firme',
    title: 'Îmbrăcăminte reflectorizantă pentru firme',
    intro:
      'Geci, veste, pantaloni, tricouri polo și hanorace de avertizare pentru cine lucrează lângă drum, utilaje sau vehicule. Mai jos vezi clasa fiecărui model conform EN ISO 20471, așa cum o declară producătorul.',
    plural: 'hainele reflectorizante',
    logo: true,
  },
  {
    key: 'geci-jachete',
    slug: 'geci-de-lucru',
    heading: 'Geci și jachete de lucru',
    title: 'Geci și jachete de lucru pentru firme',
    intro:
      'Geci și jachete de lucru pentru frig, ploaie și vânt, pentru depozite frigorifice și pentru sudură. Mai jos vezi ce protecție declară producătorul pentru fiecare model.',
    plural: 'gecile și jachetele de lucru',
    logo: true,
  },
  {
    key: 'pantaloni',
    slug: 'pantaloni-de-lucru',
    heading: 'Pantaloni de lucru și salopete',
    title: 'Pantaloni de lucru și salopete pentru firme',
    intro:
      'Pantaloni de lucru, pantaloni cu pieptar și salopete pentru construcții, producție și logistică. Mai jos vezi certificările fiecărui model.',
    plural: 'pantalonii și salopetele de lucru',
    logo: true,
  },
  {
    key: 'tricouri-polo',
    slug: 'tricouri-polo-de-lucru',
    heading: 'Tricouri și tricouri polo de lucru',
    title: 'Tricouri și tricouri polo de lucru pentru firme',
    intro:
      'Tricouri și tricouri polo pentru echipă, de purtat singure sau sub geacă, cu logo-ul firmei. Mai jos vezi certificările fiecărui model.',
    plural: 'tricourile și tricourile polo',
    logo: true,
  },
  {
    key: 'bluze-hanorace',
    slug: 'bluze-si-hanorace-de-lucru',
    heading: 'Bluze și hanorace de lucru pentru firme',
    title: 'Bluze și hanorace de lucru pentru firme',
    intro:
      'Hanorace și pulovere pentru echipă, de purtat peste tricou sau sub geacă, cu logo-ul firmei. Mai jos vezi materialul și certificările fiecărui model.',
    plural: 'bluzele și hanoracele de lucru',
    logo: true,
  },
  {
    key: 'camasi',
    slug: 'camasi-corporate',
    heading: 'Cămăși corporate pentru firme',
    title: 'Cămăși corporate pentru angajați',
    intro:
      'Cămăși pentru echipele de la birou, recepție și vânzări, în croieli pentru bărbați și pentru femei, cu logo-ul firmei. Mai jos vezi materialul și croielile fiecărei linii.',
    plural: 'cămășile corporate',
    logo: true,
  },
  {
    key: 'veste',
    slug: 'veste-de-lucru',
    heading: 'Veste de lucru',
    title: 'Veste de lucru pentru firme',
    intro:
      'Veste de lucru care lasă brațele libere: termice, pentru frig, sau cu buzunare, ca să fii văzut pe șantier și în depozit. Mai jos vezi certificările fiecărui model.',
    plural: 'vestele de lucru',
    logo: true,
  },
  // Căștile, mănușile, ochelarii și antifoanele: din vânzările You Protect (19.11.2026). Logo: nicio fișă n-are zone de
  // logo de la producător.
  {
    key: 'casti-protectie',
    slug: 'casti-de-protectie',
    heading: 'Căști de protecție pentru firme',
    title: 'Căști de protecție pentru firme',
    intro:
      'Căști de protecție pentru șantier, industrie și lucru la înălțime. Mai jos vezi standardele fiecărui model, așa cum le declară producătorul.',
    plural: 'căștile de protecție',
    logo: false,
  },
  {
    key: 'manusi',
    slug: 'manusi-de-protectie',
    heading: 'Mănuși de protecție pentru firme',
    title: 'Mănuși de protecție pentru firme',
    intro:
      'Mănuși de protecție pentru manipulare, tăiere, impact, frig, sudură, substanțe chimice și lucrări electrice. Mai jos vezi nivelurile de protecție ale fiecărui model, așa cum le declară producătorul.',
    plural: 'mănușile de protecție',
    logo: false,
  },
  {
    key: 'protectia-ochilor',
    slug: 'ochelari-de-protectie',
    heading: 'Ochelari și viziere de protecție',
    title: 'Ochelari și viziere de protecție pentru firme',
    intro:
      'Ochelari și viziere de protecție pentru ochi și față, pentru șantier, ateliere și producție. Mai jos vezi standardele fiecărui model, așa cum le declară producătorul.',
    plural: 'ochelarii și vizierele de protecție',
    logo: false,
  },
  {
    key: 'antifoane',
    slug: 'antifoane',
    heading: 'Antifoane pentru firme',
    title: 'Antifoane pentru protecția auzului',
    intro:
      'Antifoane pentru echipele care lucrează lângă utilaje zgomotoase. Mai jos vezi atenuarea declarată de producător pentru fiecare model.',
    plural: 'antifoanele',
    logo: false,
  },
  {
    key: 'protectia-respiratorie',
    slug: 'masti-de-protectie',
    heading: 'Măști de protecție respiratorie',
    title: 'Măști de protecție respiratorie pentru firme',
    intro:
      'Semimăști și filtre pentru protecția căilor respiratorii. Mai jos vezi standardele și clasele fiecărui model, așa cum le declară producătorul.',
    plural: 'măștile și filtrele de protecție',
    logo: false,
  },
  {
    key: 'protectie-cadere',
    slug: 'hamuri-de-siguranta',
    heading: 'Hamuri și lonje de siguranță',
    title: 'Hamuri și lonje de siguranță pentru firme',
    intro:
      'Hamuri și lonje pentru lucrul la înălțime. Mai jos vezi standardele fiecărui model, așa cum le declară producătorul.',
    plural: 'hamurile și lonjele de siguranță',
    logo: false,
  },
  {
    key: 'combinezoane',
    slug: 'combinezoane-de-protectie',
    heading: 'Combinezoane de protecție chimică',
    title: 'Combinezoane de protecție chimică pentru firme',
    intro:
      'Combinezoane pentru lucrul cu particule, stropi și substanțe periculoase. Mai jos vezi tipurile de protecție declarate de producător pentru fiecare model.',
    plural: 'combinezoanele de protecție',
    logo: false,
  },
];

export function categoryPageFor(key: CategoryKey): CategoryPage | undefined {
  return CATEGORY_PAGES.find((c) => c.key === key);
}

/** Lista mărcilor, în română: „MASCOT”, „MASCOT și Sir Safety”, „A, B și C”. */
export function joinRo(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} și ${items[items.length - 1]}`;
}

/** Paginile de categorie care se publică: cele cu cel puțin MIN_PRODUCTS_FOR_CATEGORY_PAGE produse publicate. */
export function activeCategoryPages(products: { category: CategoryKey }[]): CategoryPage[] {
  return CATEGORY_PAGES.filter(
    (page) => products.filter((p) => p.category === page.key).length >= MIN_PRODUCTS_FOR_CATEGORY_PAGE,
  );
}

/** „1 model”, „4 modele”, „20 de modele”. */
export function modelsLabel(n: number): string {
  if (n === 1) return '1 model';
  return `${n} ${new Intl.PluralRules('ro').select(n) === 'other' ? 'de ' : ''}modele`;
}

/** Descrierea din Google: cifrele și mărcile vin din produse. */
/** Numele scurt al mărcii, pentru texte: fără ® și fără „System” („Sir Safety System” → „Sir Safety”). */
export function shortBrand(brand: string): string {
  return brand.replace('®', '').replace(/ System$/, '').trim();
}

/** Descrierea din Google (max. 160 de caractere): cu mărcile, sau doar câți producători sunt când lista nu încape. */
export function categoryDescription(page: CategoryPage, count: number, brands: string[]): string {
  const tail = ', cu certificările fiecărui model. Ofertă de la You Protect, Satu Mare.';
  const withBrands = `${page.heading}: ${modelsLabel(count)} ${joinRo(brands.map(shortBrand))}${tail}`;
  if ([...withBrands].length <= 160) return withBrands;
  return `${page.heading}: ${modelsLabel(count)} de la ${brands.length} producători${tail}`;
}
