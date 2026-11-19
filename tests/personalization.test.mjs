// Pagina de personalizare (/haine-de-lucru-personalizate/): texte care încap în Google, zone de logo luate doar din
// fișele cu date de la producător și nicio cantitate minimă sau termen scris pe site (le dăm în ofertă).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PERSONALIZATION_PAGE,
  productsWithHiVisLimit,
  productsWithLogoZones,
  zonesLabel,
} from '../src/lib/personalization.ts';
import { CATEGORY_PAGES } from '../src/lib/catalog-categories.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const products = readdirSync(join(ROOT, 'src/content/products'))
  .filter((n) => n.endsWith('.json'))
  .map((n) => ({ id: n.replace(/\.json$/, ''), data: JSON.parse(readFileSync(join(ROOT, 'src/content/products', n), 'utf8')) }))
  .filter((p) => p.data.status === 'published');

test('personalizare: titlul și descrierea încap în rezultatele Google', () => {
  // Aceeași limită ca la fișele de produs: 50 de caractere + „ | You Protect”.
  assert.ok([...`${PERSONALIZATION_PAGE.title} | You Protect`].length <= 64);
  const d = [...PERSONALIZATION_PAGE.description].length;
  assert.ok(d >= 70 && d <= 160, `descriere de ${d} caractere`);
});

test('personalizare: pagina există la adresa din PERSONALIZATION_PAGE', () => {
  const slug = PERSONALIZATION_PAGE.href.replace(/^\/|\/$/g, '');
  assert.match(slug, /^[a-z0-9]+(-[a-z0-9]+)*$/);
  readFileSync(join(ROOT, 'src/pages', `${slug}.astro`), 'utf8');
});

test('personalizare: zonele de logo vin doar din fișele cu date de la producător', () => {
  const withZones = productsWithLogoZones(products);
  assert.ok(withZones.length > 0);
  for (const e of withZones) assert.ok(e.data.personalization.placements.length > 0, e.id);
  const empty = products.filter((e) => e.data.personalization && e.data.personalization.placements.length === 0);
  for (const e of empty) assert.ok(!withZones.includes(e), `${e.id} nu are zone, nu apare în listă`);
});

test('personalizare: limitele EN ISO 20471 apar doar la hainele reflectorizante', () => {
  for (const e of productsWithHiVisLimit(products)) {
    assert.equal(e.data.category, 'reflectorizante', e.id);
    assert.match(e.data.personalization.hiVisNote, /EN ISO 20471/);
  }
});

test('personalizare: categoriile fără date de logo nu promit logo', () => {
  for (const page of CATEGORY_PAGES) {
    const items = products.filter((p) => p.data.category === page.key);
    const anyLogoData = items.some((p) => p.data.personalization);
    if (!page.logo) assert.ok(!anyLogoData, `${page.slug}: are produse cu zone de logo, dar logo: false`);
  }
  assert.equal(CATEGORY_PAGES.find((c) => c.key === 'incaltaminte').logo, false);
});

test('personalizare: pe site nu scriem cantități minime sau termene în cifre', () => {
  const source = readFileSync(join(ROOT, 'src/pages/haine-de-lucru-personalizate.astro'), 'utf8')
    + readFileSync(join(ROOT, 'src/lib/personalization.ts'), 'utf8');
  const promise = /\d+\s*(de\s+)?(bucăți|buc\.|piese|zile|săptămâni)/i;
  assert.doesNotMatch(source, promise);
});

test('personalizare: „zone” în română', () => {
  assert.equal(zonesLabel(1), '1 zonă');
  assert.equal(zonesLabel(4), '4 zone');
  assert.equal(zonesLabel(14), '14 zone');
  assert.equal(zonesLabel(20), '20 de zone');
});
