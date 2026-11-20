// Regulile câmpurilor din formulare, comune pentru browser (MultiStepForm, TCOCalculator) și server (server/leads.js),
// ca pagina să nu accepte ce serverul refuză.

/** „Cantități, mărimi, coduri”: răspunsul `detalii` din cererea de ofertă. */
export const DETAILS_MAX_LENGTH = 1000;

/** Email: un singur @, fără spații, cu punct în domeniu. Înainte, pagina accepta „ion@@firma.ro”, iar serverul îl
 *  refuza, și vizitatorul vedea doar „încearcă din nou”. */
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
