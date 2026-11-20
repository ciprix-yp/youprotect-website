// „Testare fără riscuri” nu se aplică la căști, ochelari, viziere, antifoane și mănuși electroizolante (D-2026-11-19-06),
// nici la echipamentul de sudură și la mănușile de protecție chimică (D-2026-11-20-02).
// Testul prinde un produs nou din aceste grupe care ar intra în catalog fără `"riskFreeTesting": false`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { riskFreeExclusions } from '../src/lib/risk-free-scope.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const products = readdirSync(join(ROOT, 'src/content/products'))
  .filter((n) => n.endsWith('.json'))
  .map((n) => ({ id: n.replace(/\.json$/, ''), ...JSON.parse(readFileSync(join(ROOT, 'src/content/products', n), 'utf8')) }))
  .map((p) => ({ ...p, riskFreeTesting: p.riskFreeTesting ?? true }));

const EXCLUDED_CATEGORIES = [
  'casti-protectie',
  'protectia-ochilor',
  'antifoane',
  'protectia-respiratorie',
  'protectie-cadere',
  'combinezoane',
];

test('căștile, ochelarii, vizierele și antifoanele nu intră în testare', () => {
  const wrong = products.filter((p) => EXCLUDED_CATEGORIES.includes(p.category) && p.riskFreeTesting).map((p) => p.id);
  assert.deepEqual(wrong, []);
});

test('mănușile electroizolante nu intră în testare', () => {
  const wrong = products.filter((p) => /electroizolant/i.test(p.name) && p.riskFreeTesting).map((p) => p.id);
  assert.deepEqual(wrong, []);
});

// D-2026-11-20-02: nici echipamentul de sudură (haine ignifuge, mănuși) și nici mănușile de protecție chimică.
test('echipamentul de sudură și mănușile de protecție chimică nu intră în testare', () => {
  const wrong = products.filter((p) => /sudur|ignifug|chimic/i.test(p.name) && p.riskFreeTesting).map((p) => p.id);
  assert.deepEqual(wrong, []);
});

test('riskFreeExclusions: categoria întreagă când toate sunt excluse, altfel modelele', () => {
  const items = [
    { name: 'Cască A', category: 'casti-protectie', riskFreeTesting: false },
    { name: 'Cască B', category: 'casti-protectie', riskFreeTesting: false },
    { name: 'Mănuși de lucru X', category: 'manusi', riskFreeTesting: true },
    { name: 'Mănuși electroizolante Y', category: 'manusi', riskFreeTesting: false },
    { name: 'Tricou Z', category: 'tricouri-polo', riskFreeTesting: true },
  ];
  // Ordinea e cea din CATEGORIES: căștile înaintea mănușilor.
  assert.deepEqual(riskFreeExclusions(items), ['căști de protecție', 'mănuși electroizolante Y']);
  assert.deepEqual(riskFreeExclusions([{ name: 'Tricou Z', category: 'tricouri-polo', riskFreeTesting: true }]), []);
});

test('calculatorul de cost nu oferă testare pentru căști și ochelari', async () => {
  const { TCO_CATEGORIES } = await import('../src/lib/tco.js');
  assert.equal(TCO_CATEGORIES.casti.riskFreeTesting, false);
  assert.equal(TCO_CATEGORIES.ochelari.riskFreeTesting, false);
  for (const key of ['incaltaminte', 'imbracaminte', 'manusi']) assert.equal(TCO_CATEGORIES[key].riskFreeTesting, true, key);
});
