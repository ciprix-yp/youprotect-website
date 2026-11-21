// public/_redirects: fiecare redirect spre o pagină a site-ului se termină în „/”. Fără el, Cloudflare mai face un
// 308 spre varianta cu „/”, iar Google vede două salturi (găsit pe 18.11.2026 la /cine-suntem -> /despre-noi).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pageExists, redirectRules as rules } from './site-routes.js';

test('redirect-uri: fiecare regulă are sursă, țintă și cod 301/302', () => {
  for (const r of rules) {
    assert.equal(r.length, 3, r.join(' '));
    assert.match(r[2], /^30[12]$/, r.join(' '));
  }
});

test('redirect-uri: țintele spre pagini se termină în „/”', () => {
  const bad = rules
    .map(([from, to]) => ({ from, to }))
    .filter(({ to }) => to.startsWith('/') && !/\.[a-z0-9]+$/i.test(to) && !to.endsWith('/'))
    .map(({ from, to }) => `${from} -> ${to}`);
  assert.deepEqual(bad, []);
});

test('redirect-uri: nicio sursă nu apare de două ori', () => {
  const seen = new Set();
  const dup = rules.map(([from]) => from).filter((f) => (seen.has(f) ? true : (seen.add(f), false)));
  assert.deepEqual(dup, []);
});

// Pe 21.11.2026, /contact trimitea spre /programeaza-discutie/ (de la mutarea de pe Wix); o pagină nouă /contact/ ar fi
// rămas ascunsă pentru cine scria adresa fără „/” la final.
test('redirect-uri: nicio sursă nu ascunde o pagină care există', () => {
  const shadowed = rules.map(([from]) => from).filter((from) => !from.includes('*') && pageExists(from));
  assert.deepEqual(shadowed, []);
});

test('redirect-uri: țintele din site există', () => {
  const missing = rules
    .map(([, to]) => to)
    .filter((to) => to.startsWith('/') && !/\.[a-z0-9]+$/i.test(to) && !to.startsWith('/produse/'))
    .filter((to) => !pageExists(to));
  assert.deepEqual(missing, []);
});
