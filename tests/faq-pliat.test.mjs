// Întrebările frecvente sunt pliate pe tot site-ul (D-2026-11-27-03): fiecare răspuns din JSON-LD FAQPage
// apare în HTML într-un <details>, nu mai apare deschis în afara lui, iar paginile nu au <dl>/<dt> cu întrebări.
// Ca tests/qa-pr104-dist.test.mjs: fără dist/ testele sar; cu POZE_REQUIRE_DIST=1 pică.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist');
const HAS_DIST = (() => {
  try {
    readdirSync(DIST);
    return true;
  } catch {
    return false; // dist/ lipsește: fără verificare prealabilă, doar încercarea reală
  }
})();
const REQUIRE_DIST = process.env.POZE_REQUIRE_DIST === '1';
// /cum-lucram/ are propria lui structură (PR separat).
const SKIP = new Set(['/cum-lucram/index.html']);

function pages(dir = DIST) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return ['_astro', 'images', 'fonts'].includes(e.name) ? [] : pages(p);
    return e.name.endsWith('.html') ? [p] : [];
  });
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
// O singură trecere: o entitate decodificată nu mai e decodificată a doua oară („&amp;lt;” rămâne „&lt;”).
const decode = (s) =>
  s.replace(/&(?:#x([0-9a-f]+)|#(\d+)|([a-z]+));/gi, (m, hex, dec, name) =>
    hex ? String.fromCodePoint(parseInt(hex, 16)) : dec ? String.fromCodePoint(Number(dec)) : (ENTITIES[name.toLowerCase()] ?? m),
  );
const textOf = (html) => decode(html.replace(/<script[\s\S]*?<\/script[^>]*>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const norm = (s) => s.replace(/\s+/g, ' ').trim();

function faqOf(html) {
  const out = [];
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script[^>]*>/g)) {
    let j;
    try { j = JSON.parse(m[1]); } catch { continue; }
    for (const o of j['@graph'] ?? [j]) {
      if (o['@type'] === 'FAQPage') out.push(...o.mainEntity.map((q) => ({ q: q.name, a: q.acceptedAnswer.text })));
    }
  }
  return out;
}

const DETAILS = /<details\b[\s\S]*?<\/details>/gi;

function guard(name, fn) {
  test(name, (t) => {
    if (!HAS_DIST) {
      if (REQUIRE_DIST) assert.fail('POZE_REQUIRE_DIST=1, dar dist/ lipsește: rulează `npm run build`');
      t.skip('dist/ lipsește (rulează `npm run build`)');
      return;
    }
    fn();
  });
}

guard('fiecare răspuns din FAQPage e în HTML, într-un <details>, și întrebarea nu e deschisă în afara lui', () => {
  let compared = 0;
  for (const file of pages()) {
    const rel = file.slice(DIST.length);
    if (SKIP.has(rel)) continue;
    const html = readFileSync(file, 'utf8');
    const faq = faqOf(html);
    if (faq.length === 0) continue;
    const inDetails = (html.match(DETAILS) ?? []).map(textOf).join(' | ');
    const outside = textOf(html.replace(DETAILS, ' '));
    for (const { q, a } of faq) {
      assert.ok(inDetails.includes(norm(a)), `${rel}: răspunsul la „${q}” lipsește dintr-un <details>`);
      // Se caută întrebarea, nu răspunsul: unele pagini repetă legitim faptul și în text (ex. „De unde e MASCOT?”).
      assert.ok(!outside.includes(norm(q)), `${rel}: întrebarea „${q}” apare deschisă, în afara unui <details>`);
      assert.ok(inDetails.includes(norm(q)), `${rel}: întrebarea „${q}” lipsește din <summary>`);
    }
    compared += 1;
  }
  assert.ok(compared >= 10, `prea puține pagini cu FAQPage găsite (${compared})`);
});

guard('nicio pagină cu FAQPage nu are <dl>/<dt> cu întrebările în afara unui <details>', () => {
  for (const file of pages()) {
    const rel = file.slice(DIST.length);
    if (SKIP.has(rel)) continue;
    const html = readFileSync(file, 'utf8');
    const faq = faqOf(html);
    if (faq.length === 0) continue;
    const outsideHtml = html.replace(DETAILS, ' ');
    const terms = [...outsideHtml.matchAll(/<dt\b[^>]*>([\s\S]*?)<\/dt>/gi)].map((m) => textOf(m[1]));
    for (const { q } of faq) {
      assert.ok(!terms.includes(norm(q)), `${rel}: „${q}” e un <dt> deschis`);
    }
  }
});

test('componenta FaqList: details/summary nativ, fără JavaScript', () => {
  const src = readFileSync(join(ROOT, 'src/components/FaqList.astro'), 'utf8');
  assert.match(src, /<details\b/);
  assert.match(src, /<summary\b/);
  assert.doesNotMatch(src, /<script\b|client:|onclick/i);
});
