// Paginile de marcă (/produse/<slug>/): slug-uri care nu se ciocnesc, texte care încap în Google și nicio afirmație
// pe care nu o putem dovedi („distribuitor autorizat”, „oficial”, „exclusiv”).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BRAND_PAGES, activeBrandPages, brandDescription } from '../src/lib/catalog-brands.ts';
import { CATEGORY_PAGES } from '../src/lib/catalog-categories.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const products = readdirSync(join(ROOT, 'src/content/products'))
  .filter((n) => n.endsWith('.json'))
  .map((n) => ({ id: n.replace(/\.json$/, ''), data: JSON.parse(readFileSync(join(ROOT, 'src/content/products', n), 'utf8')) }))
  .filter((p) => p.data.status === 'published');

test('mărci: slug-uri unice, fără diacritice, diferite de produse și de categorii', () => {
  const slugs = BRAND_PAGES.map((b) => b.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  for (const s of slugs) assert.match(s, /^[a-z0-9]+(-[a-z0-9]+)*$/);
  const taken = new Set([...products.map((p) => p.id), ...CATEGORY_PAGES.map((c) => c.slug)]);
  assert.deepEqual(slugs.filter((s) => taken.has(s)), []);
});

test('mărci: fiecare pagină corespunde unei mărci din fișe și se publică', () => {
  const active = activeBrandPages(products.map((p) => p.data));
  for (const page of BRAND_PAGES) {
    assert.ok(products.some((p) => p.data.supplier.brand === page.brand), `${page.slug}: nicio fișă cu marca „${page.brand}”`);
    assert.ok(active.includes(page), `${page.slug}: sub două produse publicate`);
  }
});

test('mărci: titlul și descrierea încap în rezultatele Google', () => {
  for (const page of BRAND_PAGES) {
    const count = products.filter((p) => p.data.supplier.brand === page.brand).length;
    assert.ok([...`${page.title} | You Protect`].length <= 64, `${page.slug}: titlu prea lung`);
    const d = [...brandDescription(page, count)].length;
    assert.ok(d >= 70 && d <= 160, `${page.slug}: descriere de ${d} caractere`);
  }
});

test('mărci: faptele despre producător au sursa pe site-ul lui', () => {
  for (const page of BRAND_PAGES) {
    const url = new URL(page.source.url);
    assert.equal(url.protocol, 'https:');
    assert.ok(url.hostname.endsWith(page.source.label), `${page.slug}: sursa nu e pe ${page.source.label}`);
  }
});

test('mărci: fără statut de distribuitor pe care nu-l putem dovedi', () => {
  const claims = /autorizat|oficial|exclusiv|singurul|lider|nr\.\s?1/i;
  for (const page of BRAND_PAGES) {
    for (const value of [page.heading, page.title, page.about]) assert.doesNotMatch(value, claims, page.slug);
  }
  const template = readFileSync(join(ROOT, 'src/components/products/BrandLanding.astro'), 'utf8')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
  assert.doesNotMatch(template, claims);
});
