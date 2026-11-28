// Fiecare produs publicat are miniatura de card (600 px) lângă prima poză. Fără ea, cardul ar cere o imagine care nu
// există. Dacă testul pică: npm run catalog:cards.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cardSrc, printSrc } from '../src/lib/catalog-images.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PRODUCTS = join(ROOT, 'src/content/products');

test('catalog: cardSrc doar pentru pozele locale de produs', () => {
  assert.equal(cardSrc('/images/products/geaca-x/09-PS.webp'), '/images/products/geaca-x/09-PS-card.webp');
  assert.equal(cardSrc('/images/products/geaca-x/09-PS-card.webp'), '/images/products/geaca-x/09-PS-card.webp');
  assert.equal(cardSrc('https://exemplu.ro/poza.webp'), 'https://exemplu.ro/poza.webp');
  assert.equal(cardSrc('/images/products/../../secret.webp'), '/images/products/../../secret.webp');
  assert.equal(cardSrc(undefined), undefined);
});

test('catalog: fiecare produs publicat are miniatura de card', () => {
  const missing = readdirSync(PRODUCTS)
    .filter((n) => n.endsWith('.json'))
    .map((n) => ({ n, data: JSON.parse(readFileSync(join(PRODUCTS, n), 'utf8')) }))
    .filter(({ data }) => data.status === 'published')
    .map(({ n, data }) => ({ n, src: data.colours[0].images[0].src }))
    .filter(({ src }) => cardSrc(src) !== src && !existsSync(join(ROOT, 'public', cardSrc(src))))
    .map(({ n, src }) => `${n}: ${cardSrc(src)}`);
  assert.deepEqual(missing, []);
});

test('catalog: printSrc doar pentru pozele locale de produs', () => {
  assert.equal(printSrc('/images/products/geaca-x/09-PS.webp'), '/images/products/geaca-x/09-PS-print.jpg');
  assert.equal(printSrc('/images/products/geaca-x/09-PS-card.webp'), '/images/products/geaca-x/09-PS-card.webp');
  assert.equal(printSrc('https://exemplu.ro/poza.webp'), 'https://exemplu.ro/poza.webp');
  assert.equal(printSrc(undefined), undefined);
});

// /catalog/ pune varianta JPEG în locul pozei înainte de „Salvează ca PDF” (altfel PDF-ul are zeci de MB).
test('catalog: fiecare produs publicat are varianta JPEG pentru PDF', () => {
  const missing = readdirSync(PRODUCTS)
    .filter((n) => n.endsWith('.json'))
    .map((n) => ({ n, data: JSON.parse(readFileSync(join(PRODUCTS, n), 'utf8')) }))
    .filter(({ data }) => data.status === 'published')
    .map(({ n, data }) => ({ n, src: data.colours[0].images[0].src }))
    .filter(({ src }) => printSrc(src) !== src && !existsSync(join(ROOT, 'public', printSrc(src))))
    .map(({ n, src }) => `${n}: ${printSrc(src)} (npm run catalog:cards)`);
  assert.deepEqual(missing, []);
});
