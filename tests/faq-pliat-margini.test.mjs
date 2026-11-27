// Cazuri-limită pentru întrebările pliate și tabelul de certificări (D-2026-11-27-03), găsite la verificarea independentă:
// - nicio întrebare/tabel nu e livrat deschis (atributul `open`); testele din faq-pliat/certificari-compact verificau
//   doar că textul e în <details>, nu și că <details> e închis (un `open` adăugat în FaqList trecea neobservat);
// - numărul de <details> FaqList de pe pagină = numărul de întrebări din FAQPage (nicio întrebare pierdută/dublată);
// - linkurile din răspunsuri: în interiorul <details>, țintă ≥ 44 px (min-h-11), către pagini care există în dist/;
// - răspunsurile sunt text simplu (FaqList randează `<p>{item.a}</p>`, fără liste/markup), deci datele nu trebuie să conțină rupturi;
// - regulile de design din 08-GHID_CONTINUT §9 pe cele două componente.
// Ca tests/faq-pliat.test.mjs: fără dist/ testele sar; cu POZE_REQUIRE_DIST=1 pică.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist');
const HAS_DIST = existsSync(DIST) && statSync(DIST).isDirectory();
const REQUIRE_DIST = process.env.POZE_REQUIRE_DIST === '1';
const FAQ_DETAILS = /<details class="group border border-white\/10 bg-\[#0f0f0f\]"[^>]*>[\s\S]*?<\/details>/g;
// Tabelul de certificări folosește aceeași clasă pe <details>; se scoate înainte de a număra întrebările.
const noCert = (html) => html.replace(/<section[^>]*aria-labelledby="certificari"[\s\S]*?<\/section>/, '');
const OPEN_ATTR = /<details\b[^>]*\sopen(\s|=|>)/;

function pages(dir = DIST) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return ['_astro', 'images', 'fonts'].includes(e.name) ? [] : pages(p);
    return e.name === 'index.html' ? [p] : [];
  });
}
const urlOf = (file) => file.slice(DIST.length).replace(/index\.html$/, '');
const faqOf = (html) => {
  const out = [];
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    let j;
    try { j = JSON.parse(m[1]); } catch { continue; }
    for (const o of j['@graph'] ?? [j]) if (o['@type'] === 'FAQPage') out.push(...o.mainEntity.map((q) => ({ q: q.name, a: q.acceptedAnswer.text })));
  }
  return out;
};

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

// Paginile fără FaqList: /cum-lucram/ (alt PR) și fișele de produs (au propriul <details>, în ProductDetail.astro).
const faqListPages = () =>
  pages().filter((f) => {
    const html = noCert(readFileSync(f, 'utf8'));
    return faqOf(html).length > 0 && (html.match(FAQ_DETAILS) ?? []).length > 0;
  });

guard('FaqList: număr de <details> = număr de întrebări din FAQPage, toate închise, pe 28 de pagini', () => {
  const list = faqListPages();
  // homepage 1 + ghiduri 4 + categorii 14 + mărci 3 + industrii 3 + personalizare, testare, calculator 3 = 28
  assert.ok(list.length >= 28, `se așteaptă ≥ 28 de pagini cu FaqList, găsite ${list.length}`);
  for (const f of list) {
    const html = noCert(readFileSync(f, 'utf8'));
    const details = html.match(FAQ_DETAILS) ?? [];
    const faq = faqOf(html);
    if (urlOf(f) === '/cum-lucram/') continue;
    // Fișele de produs au și ele FAQPage, dar cu <details> proprii: aici contează doar paginile cu FaqList.
    assert.equal(details.length, faq.length, `${urlOf(f)}: ${details.length} <details> pentru ${faq.length} întrebări`);
    for (const d of details) assert.ok(!OPEN_ATTR.test(d), `${urlOf(f)}: întrebare livrată deschisă (atribut open)`);
  }
});

guard('tabelul de certificări e livrat închis (fără atributul open) pe cele 17 pagini', () => {
  let n = 0;
  for (const f of pages()) {
    const html = readFileSync(f, 'utf8');
    if (!html.includes('id="certificari"')) continue;
    const section = html.match(/<section[^>]*aria-labelledby="certificari"[\s\S]*?<\/section>/)[0];
    const open = section.match(/<details\b[^>]*>/)[0];
    assert.ok(!OPEN_ATTR.test(open), `${urlOf(f)}: tabel livrat deschis: ${open}`);
    n += 1;
  }
  assert.equal(n, 17);
});

guard('linkurile din răspunsuri: în <details>, min-h-11, către pagini existente', () => {
  let links = 0;
  for (const f of faqListPages()) {
    const html = noCert(readFileSync(f, 'utf8'));
    for (const d of html.match(FAQ_DETAILS) ?? []) {
      const a = d.match(/<a href="([^"]+)" class="([^"]*)"[^>]*>([^<]+)<\/a>/);
      if (!a) continue;
      links += 1;
      assert.match(a[2], /\bmin-h-11\b/, `${urlOf(f)}: linkul „${a[3]}” fără min-h-11`);
      assert.ok(a[3].trim().length > 0);
      const target = a[1].split('#')[0];
      if (target.startsWith('/')) assert.ok(existsSync(join(DIST, target, 'index.html')), `${urlOf(f)}: ținta ${a[1]} nu există în dist/`);
    }
  }
  assert.ok(links >= 20, `prea puține linkuri în răspunsuri (${links})`);
});

guard('răspunsurile din FAQPage sunt text simplu (FaqList nu randează liste sau markup)', () => {
  for (const f of pages()) {
    const html = readFileSync(f, 'utf8');
    for (const { q, a } of faqOf(html)) {
      for (const [k, v] of [['întrebare', q], ['răspuns', a]]) {
        assert.ok(!/[<>\n\r\t]|^\s*[-•*]\s/.test(v), `${urlOf(f)}: ${k} cu markup/rupturi de rând, pe care FaqList nu le păstrează: ${JSON.stringify(v.slice(0, 60))}`);
      }
    }
  }
});

test('FaqList și CertificationsTable respectă regulile de design din 08-GHID_CONTINUT §9', () => {
  for (const rel of ['src/components/FaqList.astro', 'src/components/products/CertificationsTable.astro']) {
    const src = readFileSync(join(ROOT, rel), 'utf8');
    assert.doesNotMatch(src, /font-light/, `${rel}: font-light pe text`);
    assert.doesNotMatch(src, /transition-all|\btransition\b(?!-)/, `${rel}: transition-all / transition generic`);
    // Clasele de summary și chevron sunt în constantele comune din src/lib/ui.ts (verificate mai jos).
    assert.match(src, /<summary class=\{disclosureSummary\}/, `${rel}: summary fără disclosureSummary`);
    assert.match(src, /class=\{disclosureChevron\}/, `${rel}: chevron fără disclosureChevron`);
    assert.doesNotMatch(src, /overflow-x-(auto|scroll)/, `${rel}: derulare laterală`);
  }
  const ui = readFileSync(join(ROOT, 'src/lib/ui.ts'), 'utf8');
  const summaryCls = ui.match(/disclosureSummary =\s*'([^']*)'/)[1];
  const chevronCls = ui.match(/disclosureChevron = '([^']*)'/)[1];
  assert.match(summaryCls, /\bmin-h-11\b/, 'summary fără min-h-11');
  assert.match(summaryCls, /focus-visible:outline-2/, 'summary fără focus vizibil');
  assert.match(chevronCls, /motion-reduce:transition-none/, 'chevron fără motion-reduce');
  assert.match(chevronCls, /transition-transform/, 'chevron: tranziție doar pe transform');
  assert.doesNotMatch(ui, /disclosure[\s\S]*font-light/, 'font-light în constantele de disclosure');
  const cert = readFileSync(join(ROOT, 'src/components/products/CertificationsTable.astro'), 'utf8');
  assert.match(cert, /table-fixed/, 'tabelul trebuie să fie table-fixed');
  assert.match(cert, /\[overflow-wrap:anywhere\]/, 'codurile foarte lungi trebuie să se rupă');
  assert.match(cert, /length === 0\s*\?\s*'—'/, 'modelele fără certificări trebuie să afișeze „—”');
});
