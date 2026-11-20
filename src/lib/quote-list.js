// Lista de ofertă: produsele pe care vizitatorul le strânge din catalog („Adaugă la ofertă”) și le trimite într-o
// singură cerere, pe /cere-oferta/. Se păstrează doar în browserul vizitatorului (localStorage, QUOTE_LIST_KEY), 30 de
// zile de la ultima schimbare, și se golește după ce cererea pleacă. Serverul primește doar slug-urile, la trimitere
// (câmpul „produse”, server/leads.js, care ia de aici limita și verificarea slug-ului).
//
// Fără importuri, intenționat: modulul intră în scriptul din BaseLayout (scripts/quote-list.ts), care trebuie să rămână
// în pagină. Un import comun cu alt script (de exemplu cu formularul) l-ar scoate într-un fișier separat, care se
// încarcă prea târziu, și Chrome ar sări tranziția dintre pagini (scripts/check-inline-scripts.mjs, D-2026-11-20-14).
// De aceea formularul folosește lista prin window.ypQuoteList (QuoteListApi, mai jos), nu prin import.

/** Cheia din localStorage. */
export const QUOTE_LIST_KEY = 'yp_quote_list';
/** Câte produse pleacă într-o cerere. 15 adrese de produs încap în răspunsul „produse” din CRM (Prospector păstrează
 *  răspunsuri de cel mult 2000 de caractere). */
export const QUOTE_LIST_MAX = 15;
export const QUOTE_LIST_DAYS = 30;
/** Evenimentul trimis pe window când lista se schimbă în pagina curentă și o dată, când lista e gata de folosit
 *  (alte taburi primesc evenimentul „storage”). */
export const QUOTE_LIST_EVENT = 'yp:quote-list';

/** Slug-ul unui produs din catalog (src/content/products/<slug>.json): cuvinte mici, cifre și cratime. */
export const PRODUCT_SLUG_MAX_LENGTH = 100;
const PRODUCT_SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+){1,15}$/;
/** @param {unknown} value @returns {value is string} */
export const isProductSlug = (value) =>
  typeof value === 'string' && value.length <= PRODUCT_SLUG_MAX_LENGTH && PRODUCT_SLUG_REGEX.test(value);

/**
 * Lista salvată, curățată: fără duplicate, doar slug-uri valide, cel mult QUOTE_LIST_MAX, goală după 30 de zile.
 * @param {string | null} raw @param {number} [now] @returns {string[]}
 */
export function parseStoredList(raw, now = Date.now()) {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.items) || typeof data.updatedAt !== 'number') return [];
    if (now - data.updatedAt > QUOTE_LIST_DAYS * 86_400_000) return [];
    return [...new Set(data.items.filter(isProductSlug))].slice(0, QUOTE_LIST_MAX);
  } catch {
    return [];
  }
}

/** „1 produs”, „3 produse”, „20 de produse” („de” apare când PluralRules('ro') întoarce „other”). @param {number} n */
export function productsLabel(n) {
  if (n === 1) return '1 produs';
  return `${n} ${new Intl.PluralRules('ro').select(n) === 'other' ? 'de ' : ''}produse`;
}

/** @returns {Storage | null} */
function storage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Lista salvată. O listă expirată sau stricată se șterge din browser la prima citire. @returns {string[]} */
export function readQuoteList() {
  try {
    const store = storage();
    const raw = store?.getItem(QUOTE_LIST_KEY) ?? null;
    const items = parseStoredList(raw);
    if (raw !== null && items.length === 0) store?.removeItem(QUOTE_LIST_KEY);
    return items;
  } catch {
    return [];
  }
}

/** @param {string[]} items @returns {boolean} */
function writeQuoteList(items) {
  const store = storage();
  if (!store) return false;
  try {
    if (items.length) store.setItem(QUOTE_LIST_KEY, JSON.stringify({ items, updatedAt: Date.now() }));
    else store.removeItem(QUOTE_LIST_KEY);
  } catch {
    return false;
  }
  window.dispatchEvent(new CustomEvent(QUOTE_LIST_EVENT));
  return true;
}

/**
 * @param {string} slug
 * @returns {'added' | 'full' | 'unavailable'} „unavailable”: browserul nu lasă pagina să salveze (stocare blocată).
 */
export function addToQuoteList(slug) {
  const items = readQuoteList();
  if (items.includes(slug)) return 'added';
  if (items.length >= QUOTE_LIST_MAX) return 'full';
  return writeQuoteList([...items, slug]) ? 'added' : 'unavailable';
}

/** @param {string} slug */
export function removeFromQuoteList(slug) {
  const items = readQuoteList();
  if (items.includes(slug)) writeQuoteList(items.filter((s) => s !== slug));
}

export function clearQuoteList() {
  writeQuoteList([]);
}

/** Apelează fn cu lista nouă la orice schimbare, din pagina asta sau din alt tab. @param {(items: string[]) => void} fn */
export function onQuoteListChange(fn) {
  const handler = () => fn(readQuoteList());
  window.addEventListener(QUOTE_LIST_EVENT, handler);
  window.addEventListener('storage', (e) => {
    if (e.key === null || e.key === QUOTE_LIST_KEY) handler();
  });
}

/**
 * Ce primește formularul prin window.ypQuoteList (pus de scripts/quote-list.ts pe fiecare pagină).
 * @typedef {{ read: () => string[], add: (slug: string) => 'added' | 'full' | 'unavailable',
 *   remove: (slug: string) => void, clear: () => void, label: (n: number) => string, max: number }} QuoteListApi
 */
/** @type {QuoteListApi} */
export const quoteListApi = {
  read: readQuoteList,
  add: addToQuoteList,
  remove: removeFromQuoteList,
  clear: clearQuoteList,
  label: productsLabel,
  max: QUOTE_LIST_MAX,
};
