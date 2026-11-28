// Clasele comune ale paginilor (catalog, categorii, mărci, fișa de produs), ca butoanele, titlurile și breadcrumb-ul
// să arate la fel peste tot. Stilul de referință e catalogul (/produse/).

export const btnPrimary =
  'inline-flex h-12 items-center justify-center rounded-lg bg-yp-yellow px-6 text-sm font-medium text-yp-black transition hover:bg-white active:scale-[0.98]';
export const btnSecondary =
  'inline-flex h-12 items-center justify-center rounded-lg border border-yp-white/25 px-6 text-sm font-medium text-yp-white transition hover:border-yp-yellow hover:text-yp-yellow active:scale-[0.98]';

/** Titlul unei secțiuni (h2). */
export const sectionTitle = 'mb-4 font-heading text-lg font-medium text-yp-white';
/** Eticheta unui grup mic de informații (de exemplu, lângă butoanele de pe fișa de produs). */
export const labelTitle = 'mb-2 text-sm font-medium text-yp-white';

export const breadcrumbNav = 'mb-6 flex flex-wrap items-center text-sm text-yp-white/60';
/** Containerul paginii: aceeași lățime și aceeași margine ca header-ul și footer-ul. */
export const pageContainer = 'mx-auto max-w-7xl px-4';

/** H1-ul paginii, ca în catalog. */
export const pageTitle = 'font-heading text-3xl font-light leading-tight text-yp-white md:text-4xl md:leading-10';
/** Paragraful de sub H1. */
export const pageIntro = 'mt-4 text-base leading-relaxed text-yp-white/75';
/** Textul lung (pagini legale, ghiduri): rânduri de cel mult ~70 de caractere. */
export const readingColumn = 'max-w-3xl';

/** Rândul care deschide un <details> (întrebări frecvente, tabelul de certificări): țintă ≥ 44 px, fără marker nativ. */
export const disclosureSummary =
  'flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 p-6 text-lg font-medium text-white focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-yp-yellow [&::-webkit-details-marker]:hidden';
/** Chevronul din summary; se rotește cu `group-open:` (părintele <details> are clasa `group`). */
export const disclosureChevron = 'h-6 w-6 shrink-0 transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none';
