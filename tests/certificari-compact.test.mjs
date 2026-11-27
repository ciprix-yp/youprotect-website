// Tabelul „Certificările fiecărui model” (17 pagini: 14 categorii + 3 mărci) e pliat și compact (D-2026-11-27-03):
// în <details>, fără derulare laterală, summary fără număr (regula din site-promises), fără coloana „Marcă”; pe categorii,
// marca apare ca rând mic doar unde numele modelului n-o conține; toate codurile din fișe apar în HTML.
// Măsurătoarea în browser (390 px) e în scripts/check-cert-table-mobile.mjs.
// Ca tests/qa-pr104-dist.test.mjs: fără dist/ testele sar; cu POZE_REQUIRE_DIST=1 pică.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist');
const HAS_DIST = existsSync(DIST) && statSync(DIST).isDirectory();
const REQUIRE_DIST = process.env.POZE_REQUIRE_DIST === '1';
const BRAND_PAGES = new Set(['/produse/mascot/', '/produse/portwest/', '/produse/sir-safety/']);

const decode = (s) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
const text = (h) => decode(h.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
// Oracol independent de componentă: forma scurtă a mărcii, scrisă de mână, așa cum apare în numele modelelor.
const SHORT = { 'Sir Safety System': 'Sir Safety', 'MASCOT®': 'MASCOT', Portwest: 'Portwest', 'Base Protection': 'Base Protection', Climax: 'Climax' };
const needsBrandRow = (name, brand) => {
  assert.ok(SHORT[brand], `marcă nouă în catalog: „${brand}” (adaug-o în SHORT)`);
  return !name.toLowerCase().includes(SHORT[brand].toLowerCase());
};

function certPages() {
  const out = [];
  (function walk(d) {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === 'index.html') {
        const html = readFileSync(p, 'utf8');
        if (html.includes('id="certificari"')) out.push({ url: p.slice(DIST.length).replace(/index\.html$/, ''), html });
      }
    }
  })(DIST);
  return out;
}

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

guard('17 pagini cu tabel de certificări: în <details>, fără overflow-x, summary fără număr', () => {
  const pages = certPages();
  assert.equal(pages.length, 17, 'se așteaptă 14 categorii + 3 mărci');
  for (const { url, html } of pages) {
    const section = html.match(/<section[^>]*aria-labelledby="certificari"[\s\S]*?<\/section>/)?.[0];
    assert.ok(section, `${url}: secțiunea #certificari lipsește`);
    assert.match(section, /<h2 id="certificari"/, `${url}: h2#certificari`);
    const details = section.match(/<details\b[\s\S]*?<\/details>/)?.[0];
    assert.ok(details && details.includes('<table'), `${url}: tabelul nu e într-un <details>`);
    assert.ok(!section.slice(0, section.indexOf('<table')).includes('<h2', section.indexOf('<h2') + 1), `${url}: h2 în summary`);
    assert.ok(!/<summary[^>]*>[\s\S]*<h[1-6]/.test(details.split('</summary>')[0]), `${url}: titlu în <summary>`);
    assert.doesNotMatch(section, /overflow-x-auto/, `${url}: overflow-x-auto în jurul tabelului`);
    const rows = (details.match(/<tbody>([\s\S]*?)<\/tbody>/)[1].match(/<tr\b/g) ?? []).length;
    const summary = text(details.match(/<summary[\s\S]*?<\/summary>/)[0]);
    // Fără număr în summary: nicio pagină nu spune câte modele are catalogul (tests/site-promises.test.mjs).
    assert.equal(summary, rows === 1 ? 'Vezi certificările modelului' : 'Vezi certificările modelelor', `${url}: summary „${summary}”`);
    assert.ok(rows >= 1, `${url}: tabel fără rânduri`);
    assert.ok(section.includes('Ce înseamnă fiecare marcaj găsești pe fișa produsului.'), `${url}: nota de sub tabel`);
  }
});

guard('mărci fără coloana „Marcă”; categorii cu rând de marcă exact unde numele nu o conține; toate codurile apar', () => {
  let brandRows = 0;
  let models = 0;
  for (const { url, html } of certPages()) {
    const table = html.match(/<table[\s\S]*?<\/table>/)[0];
    const heads = [...table.matchAll(/<th scope="col"[^>]*>([\s\S]*?)<\/th>/g)].map((m) => text(m[1]));
    assert.deepEqual(heads, ['Model', 'Certificări declarate de producător'], `${url}: antetul tabelului`);
    const rows = [...table.match(/<tbody>([\s\S]*?)<\/tbody>/)[1].matchAll(/<tr\b[\s\S]*?<\/tr>/g)].map((m) => m[0]);
    for (const row of rows) {
      const id = row.match(/href="\/produse\/([^/"]+)\/"/)[1];
      const data = JSON.parse(readFileSync(join(ROOT, 'src/content/products', `${id}.json`), 'utf8'));
      const rowHead = row.match(/<th scope="row"[\s\S]*?<\/th>/)[0];
      const small = [...rowHead.matchAll(/<span class="[^"]*\bblock\b[^"]*text-xs[^"]*">([\s\S]*?)<\/span>/g)].map((m) => text(m[1]));
      const brand = data.supplier.brand;
      const need = !BRAND_PAGES.has(url) && needsBrandRow(data.name, brand);
      assert.deepEqual(small, need ? [brand] : [], `${url}: rândul de marcă pentru „${data.name}” (marca „${brand}”)`);
      if (need) brandRows += 1;
      models += 1;
      const cells = text(row.match(/<td[\s\S]*?<\/td>/)[0]);
      const codes = data.certifications.map((c) => c.code.replace(/\s+/g, ' ').trim());
      for (const c of codes) assert.ok(cells.includes(c), `${url}: codul „${c}” lipsește la „${data.name}”`);
      if (codes.length === 0) assert.equal(cells, '—');
      else assert.equal(cells, codes.join(' · '), `${url}: codurile la „${data.name}”`);
    }
  }
  // Pe categorii (72 de rânduri), marca apare doar la modelele al căror nume n-o conține (Base Protection / Base Amsterdam).
  assert.equal(brandRows, 1, 'rânduri de marcă pe categorii');
  assert.ok(models > 50, `prea puține modele verificate (${models})`);
  console.log(`# modele în tabele: ${models}, cu rând de marcă: ${brandRows}`);
});
