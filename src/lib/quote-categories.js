// Categoriile de pe homepage care nu au (încă) produse în catalog. Cardul duce la /cere-oferta/?categorie=<slug>,
// formularul pornește cu categoria aleasă, iar serverul o adaugă la răspunsurile cererii.
// Folosit de MultiStepForm.tsx și de server/leads.js, ca slug-urile să nu poată diverge.
export const QUOTE_CATEGORIES = {
  manusi: 'Mănuși de protecție',
  casti: 'Căști de protecție',
  ochelari: 'Ochelari de protecție',
  'lucru-la-inaltime': 'Lucru la înălțime',
};

/** Numele categoriei pentru un slug din URL, sau null dacă slug-ul nu e în listă. */
export function quoteCategoryLabel(slug) {
  return typeof slug === 'string' && Object.hasOwn(QUOTE_CATEGORIES, slug) ? QUOTE_CATEGORIES[slug] : null;
}
