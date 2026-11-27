// PageHeader: poza e deasupra textului pe telefon doar prin CSS (un singur <img>, nu două), wrapperul eroului are
// `overflow-clip` (nu `overflow-hidden`, vezi tests/scroll-timeline-overflow.test.mjs) și API-ul de props a rămas același.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const src = readFileSync(fileURLToPath(new URL('../src/components/global/PageHeader.astro', import.meta.url)), 'utf8');
const code = src.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\/\/.*$/gm, '');

test('PageHeader: cadrul pozei merge sub lg prin order-first, full-bleed, și are overflow-clip', () => {
  const frame = /const photoFrame = '([^']+)'/.exec(src)?.[1] ?? '';
  for (const c of ['order-first', '-mx-4', 'aspect-[3/2]', 'overflow-clip', 'lg:order-0', 'lg:mx-0', 'lg:aspect-[16/10]']) {
    assert.ok(frame.split(/\s+/).includes(c), `photoFrame fără ${c}`);
  }
  assert.ok(!/overflow-hidden/.test(code), 'PageHeader nu are voie să folosească overflow-hidden');
  assert.ok(!/(^|\s)(border|rounded-\w+)(\s|$)/.test(frame), 'sub lg fără ramă și colțuri: doar cu prefix lg:');
});

test('PageHeader: un singur <img> pe ramură, mutat doar prin CSS (fără a doua imagine)', () => {
  assert.equal((code.match(/<ActionPhoto\b/g) ?? []).length, 1);
  assert.equal((code.match(/<img\b/g) ?? []).length, 1);
  assert.ok(/priority/.test(code), 'eroul păstrează priority');
});

test('PageHeader: API-ul de props neschimbat', () => {
  const props = /export interface Props \{([\s\S]*?)\n\}/.exec(src)?.[1] ?? '';
  for (const p of ['title', 'intro', 'crumbs', 'image', 'heroPhoto', 'primary', 'secondary', 'microcopy']) {
    assert.ok(new RegExp(`\\b${p}\\??:`).test(props), `lipsește prop-ul ${p}`);
  }
});
