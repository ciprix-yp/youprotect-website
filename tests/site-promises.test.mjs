// Decizii ale owner-ului din 21.11.2026, verificate în sursă:
// - nicio pagină nu spune câte produse sau modele are catalogul (un număr mic face catalogul să pară sărac);
// - termenul pentru ofertă vine dintr-un singur loc, RESPONSE_TIME din src/lib/site.ts (24 de ore; 15 minute după
//   modulul de ofertare), nu scris de mână prin pagini.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const files = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : /\.(astro|tsx?|jsx?|mjs)$/.test(name) ? [p] : [];
  });
// Lista de ofertă numără produsele vizitatorului („Ai 3 produse în listă”), nu ale catalogului; pagina de preview e
// internă (noindex) și numără fișele de aprobat.
const EXEMPT = ['src/lib/quote-list.js', 'src/scripts/quote-list.ts', 'src/components/forms/MultiStepForm.tsx', 'src/pages/preview/'];
const sources = files(join(ROOT, 'src'))
  .map((p) => ({ rel: relative(ROOT, p), text: readFileSync(p, 'utf8') }))
  .filter(({ rel }) => !EXEMPT.some((e) => rel.startsWith(e)));

test('catalogul nu își afișează numărul de modele', () => {
  const COUNT = [
    /modelsLabel/,
    /\b\d+\s+(de\s+)?(modele|produse)\b/,
    /\$\{[^}]*\}\s*(de\s+)?modele\b/,
    /\{[^}]*\.length[^}]*\}\s*(de\s+)?(modele|produse)\b/,
  ];
  const hits = sources.flatMap(({ rel, text }) =>
    COUNT.filter((re) => re.test(text)).map((re) => `${rel}: ${re}`),
  );
  // În schema paginilor de catalog (ItemList), nici numberOfItems; lista de ghiduri îl poate avea.
  const catalog = sources.filter(({ rel }) => /^src\/(components\/products|pages\/produse)\//.test(rel));
  hits.push(...catalog.filter(({ text }) => /numberOfItems/.test(text)).map(({ rel }) => `${rel}: numberOfItems`));
  assert.deepEqual(hits, []);
});

test('catalogul nu sugerează cantitatea („zeci de variante”)', () => {
  const VAGUE = /\b(zeci|sute|mii) de (variante|modele|produse|articole|opțiuni)\b/i;
  assert.deepEqual(sources.filter(({ text }) => VAGUE.test(text)).map(({ rel }) => rel), []);
});

test('termenul pentru ofertă vine din RESPONSE_TIME', () => {
  const hard = sources.filter(({ rel, text }) => rel !== 'src/lib/site.ts' && /în cel mult \d+ de ore/.test(text)).map((s) => s.rel);
  assert.deepEqual(hard, []);
  assert.match(readFileSync(join(ROOT, 'src/lib/site.ts'), 'utf8'), /export const RESPONSE_TIME = "în cel mult 24 de ore";/);
});
