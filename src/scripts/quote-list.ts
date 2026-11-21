// Lista de ofertă în pagină (datele: src/lib/quote-list.js):
// - butoanele „Adaugă la ofertă” (data-quote-add=<slug>) de pe carduri și de pe fișa produsului; al doilea tap scoate;
// - linkul din antet cu numărul de produse (data-quote-link), vizibil doar când lista are ceva;
// - rândul „Ai N produse în listă” de pe fișa produsului (data-quote-summary);
// - confirmarea de jos (#quote-toast, role="status"), cu linkul spre formular; o aud și cititoarele de ecran.
// Importă doar din src/lib/quote-list.js (fără alte importuri): scriptul din BaseLayout rămâne astfel în pagină.
import {
  QUOTE_LIST_EVENT,
  QUOTE_LIST_MAX,
  addToQuoteList,
  onQuoteListChange,
  productsLabel,
  quoteListApi,
  readQuoteList,
  removeFromQuoteList,
} from '../lib/quote-list.js';

// Ca track() din src/lib/track.ts (evenimentul `yp:track`, preluat de Analytics.astro), scris aici ca să nu importăm.
const track = (name: string, params: Record<string, string>) =>
  window.dispatchEvent(new CustomEvent('yp:track', { detail: { name, params } }));

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const TOAST_MS = 4500;
let toastTimer = 0;

function showToast(message: string, withLink: boolean) {
  const toast = document.getElementById('quote-toast');
  const text = toast?.querySelector<HTMLElement>('[data-quote-toast-text]');
  const link = toast?.querySelector<HTMLElement>('[data-quote-toast-link]');
  if (!toast || !text || !link) return;
  text.textContent = message;
  link.hidden = !withLink;
  toast.dataset.open = '';
  window.clearTimeout(toastTimer);
  const hide = () => {
    // Nu închidem confirmarea cât timp vizitatorul e cu focusul sau cu mouse-ul pe ea.
    if (toast.matches(':hover, :focus-within')) {
      toastTimer = window.setTimeout(hide, 1000);
      return;
    }
    delete toast.dataset.open;
    // După ce s-a stins, golim textul: altfel cititorul de ecran l-ar mai găsi la capătul paginii.
    toastTimer = window.setTimeout(() => {
      text.textContent = '';
      link.hidden = true;
    }, 200);
  };
  toastTimer = window.setTimeout(hide, TOAST_MS);
}

function render(items: string[], animate: boolean) {
  const n = items.length;
  document.querySelectorAll<HTMLElement>('[data-quote-link]').forEach((wrap) => {
    wrap.hidden = n === 0;
    wrap.querySelector('a')?.setAttribute('aria-label', `Lista de ofertă: ${productsLabel(n)}`);
  });
  document.querySelectorAll<HTMLElement>('[data-quote-count]').forEach((badge) => {
    const changed = badge.textContent !== String(n);
    badge.textContent = String(n);
    // Numărul din antet „sare” scurt când se schimbă: arată unde a ajuns produsul.
    if (animate && changed && n > 0 && !reduceMotion.matches) {
      badge.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.3)' }, { transform: 'scale(1)' }], {
        duration: 260,
        easing: 'cubic-bezier(0.23, 1, 0.32, 1)',
      });
    }
  });
  document.querySelectorAll<HTMLElement>('[data-quote-summary]').forEach((line) => {
    line.hidden = n === 0;
    const count = line.querySelector('[data-quote-summary-count]');
    if (count) count.textContent = productsLabel(n);
  });
  document.querySelectorAll<HTMLButtonElement>('button[data-quote-add]').forEach((button) => {
    const inList = items.includes(button.dataset.quoteAdd ?? '');
    button.dataset.state = inList ? 'in' : 'out';
    const name = button.dataset.quoteName ?? '';
    button.setAttribute('aria-label', inList ? `Scoate din lista de ofertă: ${name}` : `Adaugă la ofertă: ${name}`);
  });
}

document.addEventListener('click', (e) => {
  const button = (e.target as Element | null)?.closest?.('button[data-quote-add]') as HTMLButtonElement | null;
  if (!button) return;
  const slug = button.dataset.quoteAdd ?? '';
  const name = button.dataset.quoteName ?? 'Produsul';
  if (readQuoteList().includes(slug)) {
    removeFromQuoteList(slug);
    showToast(`Am scos din listă: ${name}.`, readQuoteList().length > 0);
    return;
  }
  const result = addToQuoteList(slug);
  if (result === 'added') {
    track('quote_list_add', { location: button.dataset.quoteLocation ?? 'necunoscut' });
    showToast(`Adăugat la ofertă. Ai ${productsLabel(readQuoteList().length)} în listă.`, true);
  } else if (result === 'full') {
    showToast(`Lista are deja ${QUOTE_LIST_MAX} produse. Cere oferta pentru ele, apoi poți face o listă nouă.`, true);
  } else {
    showToast('Browserul tău nu ne lasă să păstrăm lista. Deschide produsul și apasă „Cere ofertă”.', false);
  }
});

render(readQuoteList(), false);
onQuoteListChange((items) => render(items, true));
// Formularul de ofertă (MultiStepForm) folosește lista prin window, nu prin import; îi spunem că e gata.
window.ypQuoteList = quoteListApi;
window.dispatchEvent(new CustomEvent(QUOTE_LIST_EVENT));
