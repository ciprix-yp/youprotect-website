// Personalizarea cu logo (pagina /haine-de-lucru-personalizate/). Decizia lui Ciprian din 18.11.2026: personalizarea o
// externalizăm, o facem prin parteneri. Pe site nu scriem cantități minime sau termene: le dăm în ofertă.
// Zonele de logo și limitele pentru hainele reflectorizante vin din fișele de produs (câmpul `personalization`, din
// feed-ul producătorului), ca să rămână adevărate când se schimbă catalogul.

export const PERSONALIZATION_PAGE = {
  href: '/haine-de-lucru-personalizate/',
  /** Titlul din Google; layout-ul adaugă „ | You Protect”. */
  title: 'Haine de lucru personalizate cu logo pentru firme',
  description:
    'Tricouri, polo, hanorace, geci, veste și pantaloni de lucru cu logo-ul firmei: broderie, serigrafie sau transfer termic. Ofertă de la You Protect, Satu Mare.',
  linkLabel: 'Cum funcționează personalizarea',
} as const;

/** Tehnicile, descrise prin ce sunt, fără promisiuni de durabilitate. Pe care o folosim decidem la ofertă. */
export const LOGO_TECHNIQUES = [
  { name: 'Broderie', text: 'Logo-ul e cusut cu fir colorat direct în material și are relief.' },
  { name: 'Serigrafie', text: 'Logo-ul e imprimat cu cerneală printr-o sită fină, câte o culoare pe rând.' },
  { name: 'Transfer termic', text: 'Logo-ul e tipărit pe o folie, care se lipește pe haină prin presare la cald.' },
] as const;

interface Placement {
  position: string;
  maxSize: string | null;
}

export interface PersonalizableProduct {
  name: string;
  category: string;
  personalization: { placements: Placement[]; special: boolean; hiVisNote: string | null } | null;
}

/** Produsele pentru care producătorul dă zonele de logo, în ordine alfabetică românească. */
export function productsWithLogoZones<T extends { data: PersonalizableProduct }>(entries: T[]): T[] {
  const collator = new Intl.Collator('ro', { sensitivity: 'base' });
  return entries
    .filter((e) => (e.data.personalization?.placements.length ?? 0) > 0)
    .sort((a, b) => collator.compare(a.data.name, b.data.name));
}

/** Produsele reflectorizante pentru care producătorul dă limita de suprafață a logo-ului (EN ISO 20471). */
export function productsWithHiVisLimit<T extends { data: PersonalizableProduct }>(entries: T[]): T[] {
  return productsWithLogoZones(entries).filter((e) => Boolean(e.data.personalization?.hiVisNote));
}

/** „1 zonă”, „4 zone”, „20 de zone”. */
export function zonesLabel(n: number): string {
  if (n === 1) return '1 zonă';
  return `${n} ${new Intl.PluralRules('ro').select(n) === 'other' ? 'de ' : ''}zone`;
}
