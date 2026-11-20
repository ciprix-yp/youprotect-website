// Evenimente de măsurare din componente. Le preia src/components/global/Analytics.astro și le trimite la Google
// Analytics doar dacă vizitatorul a acceptat statisticile; altfel nu se întâmplă nimic.
// Nu trimite niciodată date personale sau ce a completat vizitatorul (nume, email, telefon, prețuri).
import { LEAD_FLAG } from './session-keys.js';

export { LEAD_FLAG };

export type TrackParams = Record<string, string | number | boolean>;

export function track(name: string, params: TrackParams = {}) {
  window.dispatchEvent(new CustomEvent('yp:track', { detail: { name, params } }));
}

/** Notează cererea trimisă (cheia LEAD_FLAG): Analytics.astro o raportează o singură dată, pe pagina următoare. */
export function flagLead(form: string) {
  try {
    sessionStorage.setItem(LEAD_FLAG, form);
  } catch (_e) {
    // fără sessionStorage, cererea nu apare în statistici; cererea în sine a plecat deja
  }
}
