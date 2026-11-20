// Lista de ofertă din browser (src/lib/quote-list.js): ce se citește din localStorage și cum se scrie.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  QUOTE_LIST_DAYS,
  QUOTE_LIST_EVENT,
  QUOTE_LIST_KEY,
  QUOTE_LIST_MAX,
  addToQuoteList,
  clearQuoteList,
  parseStoredList,
  productsLabel,
  readQuoteList,
  removeFromQuoteList,
} from '../src/lib/quote-list.js';

// localStorage și window minime, ca în browser.
const store = new Map();
let events = 0;
globalThis.window = {
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  },
  dispatchEvent: () => {
    events += 1;
    return true;
  },
};
globalThis.CustomEvent ??= class extends Event {};

const slug = (i) => `produs-test-${i}`;

beforeEach(() => {
  store.clear();
  events = 0;
});

test('adăugare, fără dubluri, scoatere, golire; fiecare schimbare anunță pagina', () => {
  assert.equal(addToQuoteList(slug(1)), 'added');
  assert.equal(addToQuoteList(slug(2)), 'added');
  assert.equal(addToQuoteList(slug(1)), 'added');
  assert.deepEqual(readQuoteList(), [slug(1), slug(2)]);
  removeFromQuoteList(slug(1));
  assert.deepEqual(readQuoteList(), [slug(2)]);
  clearQuoteList();
  assert.deepEqual(readQuoteList(), []);
  assert.equal(store.has(QUOTE_LIST_KEY), false);
  assert.equal(events, 4);
});

test(`lista se oprește la ${QUOTE_LIST_MAX} produse`, () => {
  for (let i = 0; i < QUOTE_LIST_MAX; i += 1) assert.equal(addToQuoteList(slug(i)), 'added');
  assert.equal(addToQuoteList(slug(99)), 'full');
  assert.equal(readQuoteList().length, QUOTE_LIST_MAX);
});

test('stocare blocată: „unavailable”, fără excepții', () => {
  const original = window.localStorage;
  window.localStorage = { getItem: () => null, setItem: () => { throw new Error('QuotaExceeded'); }, removeItem: () => {} };
  try {
    assert.equal(addToQuoteList(slug(1)), 'unavailable');
    assert.deepEqual(readQuoteList(), []);
  } finally {
    window.localStorage = original;
  }
});

test('ce vine din localStorage se curăță: JSON stricat, slug-uri greșite, dubluri, lista expirată', () => {
  const now = Date.UTC(2026, 10, 20);
  const raw = (items, updatedAt = now) => JSON.stringify({ items, updatedAt });
  assert.deepEqual(parseStoredList('{nu e json', now), []);
  assert.deepEqual(parseStoredList(JSON.stringify({ items: 'x', updatedAt: now }), now), []);
  assert.deepEqual(parseStoredList(raw([slug(1), slug(1), '<img onerror=x>', 7, 'A-B', slug(2)]), now), [slug(1), slug(2)]);
  const day = 86_400_000;
  assert.deepEqual(parseStoredList(raw([slug(1)], now - QUOTE_LIST_DAYS * day + 1), now), [slug(1)]);
  assert.deepEqual(parseStoredList(raw([slug(1)], now - QUOTE_LIST_DAYS * day - 1), now), []);
  const many = Array.from({ length: 40 }, (_, i) => slug(i));
  assert.equal(parseStoredList(raw(many), now).length, QUOTE_LIST_MAX);
});

test('productsLabel: „1 produs”, „3 produse”, „20 de produse”', () => {
  assert.equal(productsLabel(1), '1 produs');
  assert.equal(productsLabel(3), '3 produse');
  assert.equal(productsLabel(15), '15 produse');
  assert.equal(productsLabel(20), '20 de produse');
});

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('cheia din localStorage apare în politica de cookie-uri', () => {
  assert.equal(QUOTE_LIST_KEY, 'yp_quote_list');
  assert.match(read('src/pages/politica-cookies.astro'), /\{QUOTE_LIST_KEY\}/);
});

// Scriptul din BaseLayout trebuie să rămână în pagină (scripts/check-inline-scripts.mjs): lista nu importă nimic, iar
// formularul o folosește prin window.ypQuoteList și evenimentul QUOTE_LIST_EVENT, scris de mână acolo.
test('lista de ofertă: fără importuri; formularul o folosește prin window, cu același nume de eveniment', () => {
  assert.doesNotMatch(read('src/lib/quote-list.js'), /^\s*import\b/m);
  const ui = read('src/scripts/quote-list.ts');
  for (const [, from] of ui.matchAll(/from '([^']+)'/g)) assert.equal(from, '../lib/quote-list.js');
  assert.match(ui, /window\.ypQuoteList = quoteListApi/);
  const form = read('src/components/forms/MultiStepForm.tsx');
  assert.doesNotMatch(form, /from '[^']*lib\/quote-list/);
  assert.match(form, new RegExp(`addEventListener\\('${QUOTE_LIST_EVENT}'`));
  // Evenimentul de măsurare: același nume ca în track.ts.
  assert.match(read('src/lib/track.ts'), /new CustomEvent\('yp:track'/);
  assert.match(ui, /new CustomEvent\('yp:track'/);
});

test('o listă expirată se șterge din browser la prima citire', () => {
  store.set(QUOTE_LIST_KEY, JSON.stringify({ items: [slug(1)], updatedAt: Date.now() - (QUOTE_LIST_DAYS + 1) * 86_400_000 }));
  assert.deepEqual(readQuoteList(), []);
  assert.equal(store.has(QUOTE_LIST_KEY), false);
});
