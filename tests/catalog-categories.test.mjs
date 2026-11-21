// Paginile de categorie (/produse/<slug>/): slug-uri unice, care nu se ciocnesc cu produsele, și texte pentru Google
// care încap în rezultate. Datele vin din fișele de produs publicate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CATEGORY_PAGES,
  activeCategoryPages,
  categoryDescription,
  joinRo,
} from '../src/lib/catalog-categories.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const products = readdirSync(join(ROOT, 'src/content/products'))
  .filter((n) => n.endsWith('.json'))
  .map((n) => ({ id: n.replace(/\.json$/, ''), data: JSON.parse(readFileSync(join(ROOT, 'src/content/products', n), 'utf8')) }))
  .filter((p) => p.data.status === 'published');

test('categorii: slug-uri unice, fără diacritice, diferite de produse', () => {
  const slugs = CATEGORY_PAGES.map((c) => c.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  for (const s of slugs) assert.match(s, /^[a-z0-9]+(-[a-z0-9]+)*$/);
  const productIds = new Set(products.map((p) => p.id));
  assert.deepEqual(slugs.filter((s) => productIds.has(s)), []);
});

test('categorii: se publică doar cele cu cel puțin două produse', () => {
  const active = activeCategoryPages(products.map((p) => p.data));
  for (const page of active) assert.ok(products.filter((p) => p.data.category === page.key).length >= 2, page.slug);
  assert.ok(active.length >= 1);
});

test('categorii: titlul și descrierea încap în rezultatele Google', () => {
  for (const page of activeCategoryPages(products.map((p) => p.data))) {
    const items = products.filter((p) => p.data.category === page.key);
    const brands = [...new Set(items.map((p) => p.data.supplier.brand))];
    const description = categoryDescription(page, brands);
    assert.ok([...`${page.title} | You Protect`].length <= 62, `${page.slug}: titlu prea lung`);
    assert.ok([...description].length <= 160, `${page.slug}: descriere de ${[...description].length} caractere`);
  }
});

test('categorii: textele în română', () => {
  assert.equal(joinRo(['A']), 'A');
  assert.equal(joinRo(['A', 'B']), 'A și B');
  assert.equal(joinRo(['A', 'B', 'C']), 'A, B și C');
});
