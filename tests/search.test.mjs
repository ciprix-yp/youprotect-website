// Căutarea din catalog: fără diacritice, mai multe cuvinte, iar copia din scriptul inline e identică cu src/lib/search.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { searchKey, matchesQuery } from '../src/lib/search.js';

test('searchKey: diacritice (virgulă și sedilă), majuscule, semne', () => {
  assert.equal(searchKey('Căciulă de iarnă'), 'caciula de iarna');
  assert.equal(searchKey('Încălțăminte ŞŢşţ șț Â'), 'incaltaminte stst st a');
  assert.equal(searchKey('Geacă MASCOT® Accelerate Safe (19035)'), 'geaca mascot accelerate safe 19035');
  assert.equal(searchKey('EN ISO 20471:2013+A1:2016'), 'en iso 20471 2013 a1 2016');
  assert.equal(searchKey(null), '');
});

test('matchesQuery: toate cuvintele, în orice ordine, fără diacritice', () => {
  const key = searchKey('Geacă de iarnă reflectorizantă MASCOT Accelerate Safe Haine de lucru MASCOT EN ISO 20471');
  assert.equal(matchesQuery(key, 'geaca iarna'), true);
  assert.equal(matchesQuery(key, 'MASCOT  geacă'), true);
  assert.equal(matchesQuery(key, 'reflectorizanta 20471'), true);
  assert.equal(matchesQuery(key, 'geaca portwest'), false);
  assert.equal(matchesQuery(key, '   '), true);
});

test('scriptul inline din /produse/ folosește aceeași cheie de căutare', () => {
  const page = readFileSync(new URL('../src/pages/produse/index.astro', import.meta.url), 'utf8');
  const lib = readFileSync(new URL('../src/lib/search.js', import.meta.url), 'utf8');
  const body = (src) => src.match(/String\(s \?\? ''\)[\s\S]*?\.trim\(\)/)?.[0].replace(/\s+/g, '');
  assert.ok(body(lib), 'searchKey lipsește din src/lib/search.js');
  assert.equal(body(page), body(lib));
});
