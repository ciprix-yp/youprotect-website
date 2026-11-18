// Categoriile de pe homepage care nu au (încă) produse în catalog. Cardul duce la /cere-oferta/?categorie=<slug>,
// formularul pornește cu categoria aleasă, iar serverul o adaugă la răspunsurile cererii.
// Folosit de MultiStepForm.tsx și de server/leads.js, ca slug-urile să nu poată diverge.
export const QUOTE_CATEGORIES = {
  manusi: 'Mănuși de protecție',
  casti: 'Căști de protecție',
  ochelari: 'Ochelari de protecție',
  'lucru-la-inaltime': 'Lucru la înălțime',
};

// Întrebarea despre personalizare din „Cere ofertă” (decizia lui Ciprian, 18.11.2026, convenită cu Prospector).
// Valorile sunt fixe: CRM-ul le primește în `answers` ca {question: "personalizare", label: "Personalizare cu logo"},
// iar în `structured`, când îl facem, ca personalizare: "da" | "nu" | "nu_stiu".
export const PERSONALIZATION_ANSWERS = ['Da', 'Nu', 'Nu știu încă'];

/** Numele categoriei pentru un slug din URL, sau null dacă slug-ul nu e în listă. */
export function quoteCategoryLabel(slug) {
  return typeof slug === 'string' && Object.hasOwn(QUOTE_CATEGORIES, slug) ? QUOTE_CATEGORIES[slug] : null;
}
