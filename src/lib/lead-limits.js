// Regulile câmpurilor din formulare, comune pentru browser (MultiStepForm, TCOCalculator) și server (server/leads.js),
// ca pagina să nu accepte ce serverul refuză.

/** „Cantități, mărimi, coduri”: răspunsul `detalii` din cererea de ofertă. */
export const DETAILS_MAX_LENGTH = 1000;

/** „În ce lună comandă firma de obicei echipamente”: întrebare opțională din pasul de contact (obiecția „reveniți în
 *  luna X”). Cheia și lista sunt definite doar aici; pagina le folosește pentru select, serverul pentru validare.
 *  Cheia are cel mult 40 de caractere (limita importerului CRM). */
export const ORDER_MONTH_KEY = 'luna_comenzii';
export const ORDER_MONTH_ANSWERS = [
  'ianuarie',
  'februarie',
  'martie',
  'aprilie',
  'mai',
  'iunie',
  'iulie',
  'august',
  'septembrie',
  'octombrie',
  'noiembrie',
  'decembrie',
  'De mai multe ori pe an',
  'Nu știu încă',
];

/** Email: un singur @, fără spații, cu punct în domeniu. Înainte, pagina accepta „ion@@firma.ro”, iar serverul îl
 *  refuza, și vizitatorul vedea doar „încearcă din nou”. */
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
