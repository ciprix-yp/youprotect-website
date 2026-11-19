// Ce produse nu intră în „Testare fără riscuri” (decizia owner-ului din 19.11.2026, D-2026-11-19-06): căștile,
// ochelarii, vizierele, antifoanele și mănușile electroizolante. O cască ține ani, deci 90 de zile nu arată cât rezistă,
// iar echipamentul electroizolant nu se testează cu returnare. Fiecare fișă de produs are câmpul `riskFreeTesting`
// (implicit true); textele de mai jos se generează din el, ca să rămână adevărate când se schimbă catalogul.
import { CATEGORIES, type CategoryKey } from './catalog-taxonomy.ts';

export interface ScopeProduct {
  name: string;
  category: CategoryKey;
  riskFreeTesting: boolean;
}

const lowerFirst = (s: string) => s.charAt(0).toLocaleLowerCase('ro') + s.slice(1);

/**
 * Ce nu intră în testare, în ordinea categoriilor: categoria întreagă („căști de protecție”) când niciun produs din ea
 * nu intră, altfel numele modelelor excluse.
 */
export function riskFreeExclusions(products: ScopeProduct[]): string[] {
  const out: string[] = [];
  for (const key of Object.keys(CATEGORIES) as CategoryKey[]) {
    const items = products.filter((p) => p.category === key);
    const excluded = items.filter((p) => !p.riskFreeTesting);
    if (excluded.length === 0) continue;
    if (excluded.length === items.length) out.push(lowerFirst(CATEGORIES[key]));
    else out.push(...excluded.map((p) => lowerFirst(p.name)));
  }
  return out;
}
