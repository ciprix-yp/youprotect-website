// Catalogul de răsfoit (/catalog/, CAT-004): logica paginilor (src/lib/catalog-book.ts) și pagina generată din dist/.
// Ca tests/qa-pr104-dist.test.mjs: fără dist/, testele pe pagina generată sar; cu POZE_REQUIRE_DIST=1 pică.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BENEFITS_BUDGET,
  BENEFITS_MAX,
  FRONT_PAGES,
  bookSections,
  coverItems,
  editionLabel,
  pickBenefits,
  splitContents,
} from '../src/lib/catalog-book.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist');
const HAS_DIST = existsSync(join(DIST, 'catalog/index.html'));
const REQUIRE_DIST = process.env.POZE_REQUIRE_DIST === '1';

const entry = (id, category, name, status = 'published') => ({ id, data: { name, category, status } });

test('catalog-book: categoriile în ordinea din /produse/, numele în ordine alfabetică, paginile continue', () => {
  const sections = bookSections([
    entry('b', 'incaltaminte', 'Bocanci Z'),
    entry('a', 'reflectorizante', 'Vestă'),
    entry('c', 'incaltaminte', 'Bocanci Ă'),
    entry('d', 'manusi', 'Mănuși', 'review'),
  ]);
  assert.deepEqual(
    sections.map((s) => [s.key, s.firstPage, s.items.map((e) => e.id)]),
    [
      ['reflectorizante', FRONT_PAGES + 1, ['a']],
      ['incaltaminte', FRONT_PAGES + 2, ['c', 'b']],
    ],
  );
});

test('catalog-book: cuprinsul pe două pagini, prima cu jumătatea rotunjită în sus', () => {
  assert.deepEqual(splitContents([1, 2, 3, 4, 5]), [[1, 2, 3], [4, 5]]);
  assert.deepEqual(splitContents([1, 2]), [[1], [2]]);
});

test('catalog-book: avantajele încap în buget, cel puțin unul, cel mult BENEFITS_MAX', () => {
  const a = 'a'.repeat(80);
  assert.deepEqual(pickBenefits([a, a, a]), [a, a]);
  assert.equal(pickBenefits([a, a, a]).length, BENEFITS_MAX);
  const long = 'x'.repeat(BENEFITS_BUDGET - 10);
  assert.deepEqual(pickBenefits([long, a]), [long], 'al doilea nu mai încape');
  assert.deepEqual(pickBenefits(['y'.repeat(BENEFITS_BUDGET + 50), a]), ['y'.repeat(BENEFITS_BUDGET + 50)], 'primul intră oricât de lung');
});

test('catalog-book: coperta ia categoriile alese și completează din celelalte', () => {
  const sections = bookSections([
    entry('vesta', 'reflectorizante', 'Vestă'),
    entry('bocanc', 'incaltaminte', 'Bocanc'),
    entry('pantalon', 'pantaloni', 'Pantalon'),
    entry('tricou', 'tricouri-polo', 'Tricou'),
  ]);
  assert.deepEqual(coverItems(sections).map((e) => e.id), ['vesta', 'bocanc', 'tricou', 'pantalon']);
});

test('catalog-book: luna ediției la ora României', () => {
  assert.equal(editionLabel(new Date('2026-11-15T12:00:00Z')), 'noiembrie 2026');
  // 30.11, 23:30 UTC e deja 1 decembrie la București.
  assert.equal(editionLabel(new Date('2026-11-30T23:30:00Z')), 'decembrie 2026');
});

function guard(name, fn) {
  test(name, (t) => {
    if (!HAS_DIST) {
      if (REQUIRE_DIST) assert.fail('POZE_REQUIRE_DIST=1, dar dist/catalog/ lipsește: rulează `npm run build`');
      t.skip('dist/catalog/ lipsește');
      return;
    }
    fn();
  });
}

const html = () => readFileSync(join(DIST, 'catalog/index.html'), 'utf8');
const published = () =>
  readdirSync(join(ROOT, 'src/content/products'))
    .filter((f) => f.endsWith('.json'))
    .map((f) => ({ slug: f.slice(0, -5), ...JSON.parse(readFileSync(join(ROOT, 'src/content/products', f), 'utf8')) }))
    .filter((p) => p.status === 'published');

guard('/catalog/: noindex și în afara sitemap-ului', () => {
  assert.match(html(), /<meta name="robots" content="noindex/);
  const sitemaps = readdirSync(DIST).filter((f) => /^sitemap.*\.xml$/.test(f));
  assert.ok(sitemaps.length > 0, 'sitemap-ul lipsește din dist/');
  for (const f of sitemaps) assert.doesNotMatch(readFileSync(join(DIST, f), 'utf8'), /\/catalog\//, f);
  assert.ok(statSync(join(DIST, 'catalog/index.html')).size > 0);
});

guard('/catalog/: fiecare produs publicat are pagina lui, cu link spre fișă', () => {
  const page = html();
  for (const p of published()) {
    assert.ok(page.includes(`href="/produse/${p.slug}/"`), `lipsește ${p.slug}`);
  }
  const productPages = page.match(/aria-label="Pagina \d+: /g) ?? [];
  assert.equal(productPages.length, published().length);
});

guard('/catalog/: numărul din cuprins e pagina pe care începe categoria', () => {
  const page = html();
  // Paginile în ordinea din document: id-ul fiecărei secțiuni .cb-page (coperta e pagina 1).
  const ids = [...page.matchAll(/<section class="cb-page"[^>]*?\sid="([^"]+)"/g)].map((m) => m[1]);
  const toc = [...page.matchAll(/href="#categoria-([a-z-]+)"[^>]*>\s*<span[^>]*>[^<]+<\/span>\s*<span class="cb-toc-n"[^>]*>(\d+)<\/span>/g)];
  assert.ok(toc.length > 0, 'cuprinsul nu are rânduri');
  for (const [, key, n] of toc) {
    assert.equal(ids.indexOf(`categoria-${key}`) + 1, Number(n), `categoria ${key}`);
  }
  assert.equal(ids.at(-1), 'contact');
});

guard('/catalog/: fiecare poză are varianta JPEG pentru PDF, iar stilul de tipărire pune o pagină pe o foaie A5', () => {
  const page = html();
  const book = page.slice(page.indexOf('data-cb-book'), page.indexOf('class="cb-bar"'));
  // Logo-ul de pe copertă (192 px) nu contează la mărimea PDF-ului; pozele de produs da.
  const imgs = (book.match(/<img\b[^>]*>/g) ?? []).filter((img) => !img.includes('cb-logo'));
  assert.ok(imgs.length > published().length, 'cartea are mai puține poze decât produse');
  for (const img of imgs) {
    const print = /data-print="([^"]+)"/.exec(img)?.[1];
    assert.ok(print, `poză fără data-print: ${img.slice(0, 120)}`);
    assert.match(print, /^\/images\/products\/[a-z0-9-]+\/[A-Za-z0-9_-]+-print\.jpg$/);
    assert.ok(existsSync(join(DIST, print)), `${print} lipsește din dist/ (npm run catalog:cards)`);
  }
  assert.match(page, /data-cb-pdf/, 'lipsește butonul „Salvează ca PDF”');
  const css = readdirSync(join(DIST, '_astro'))
    .filter((f) => f.endsWith('.css'))
    .map((f) => readFileSync(join(DIST, '_astro', f), 'utf8'))
    .join('\n');
  assert.match(css, /@page\{size:148mm 210mm;margin:0\}/);
  assert.match(css, /body>:not\(main\)\{display:none!important\}/);
});
