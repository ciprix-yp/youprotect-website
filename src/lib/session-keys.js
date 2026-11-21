// Cheile din sessionStorage folosite între pagini: formularul le scrie înainte de redirect, alte pagini le citesc.
/** Datele pentru calendarul de pe /confirmare/ (nume, email, telefon, firmă), ca să nu le punem în URL. */
export const BOOKING_PREFILL_KEY = 'yp_booking_prefill';
/** Tipul cererii trimise, raportat o dată în Google Analytics (src/lib/track.ts, Analytics.astro). */
export const LEAD_FLAG = 'yp_lead';
// Lista de ofertă are cheia ei în src/lib/quote-list.js (QUOTE_LIST_KEY): modulul acela nu importă nimic, ca scriptul din
// BaseLayout să rămână în pagină.
