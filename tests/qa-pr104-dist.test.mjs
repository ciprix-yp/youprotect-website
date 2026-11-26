// Verificări independente pe dist/ pentru PR #104 (QA): cazuri pe care testele autorului nu le acopereau.
// Ca tests/poze-actiune.test.mjs: fără dist/ testele sar; cu POZE_REQUIRE_DIST=1 pică.
//   1. fontul preîncărcat există în dist/ și e cel din @font-face (altfel preload-ul e „nefolosit”, iar hash-ul a derivat)
//   2. nicio referință la /hero-youprotect-highvis.webp (eroul vechi) în paginile din dist/
//   3. pe paginile de marcă grila de produse vine ÎNAINTEA pozei în DOM, poza e unică și lazy
//   4. fiecare URL din srcset/src către /images/... din HTML există în dist/
//   5. portretul din /despre-noi/ nu are creditText/copyrightNotice și nicio figcaption cu „Foto”/„©”
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist');
const HAS_DIST = existsSync(DIST) && statSync(DIST).isDirectory();
const REQUIRE_DIST = process.env.POZE_REQUIRE_DIST === '1';

function pages(dir = DIST) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return e.name === '_astro' || e.name === 'images' || e.name === 'fonts' ? [] : pages(p);
    return e.name === 'index.html' || e.name.endsWith('.html') ? [p] : [];
  });
}

function guard(name, fn) {
  test(name, (t) => {
    if (!HAS_DIST) {
      if (REQUIRE_DIST) assert.fail('POZE_REQUIRE_DIST=1, dar dist/ lipsește: rulează `npm run build`');
      t.skip('fără dist/');
      return;
    }
    fn();
  });
}

const read = (p) => readFileSync(p, 'utf8');
const page = (route) => read(join(DIST, route, 'index.html'));

guard('fonturile preîncărcate există în dist/ și apar în CSS-ul compilat', () => {
  const css = readdirSync(join(DIST, '_astro')).filter((f) => f.endsWith('.css')).map((f) => read(join(DIST, '_astro', f))).join('\n');
  let seen = 0;
  for (const f of pages()) {
    for (const m of read(f).matchAll(/<link[^>]*rel="preload"[^>]*as="font"[^>]*>/g)) {
      const href = /href="([^"]+)"/.exec(m[0])[1];
      assert.ok(existsSync(join(DIST, href)), `${f}: preload către ${href}, dar fișierul nu există în dist/`);
      if (href.startsWith('/_astro/')) assert.ok(css.includes(href), `${f}: ${href} nu e referit de niciun @font-face din CSS`);
      seen++;
    }
  }
  assert.ok(seen > 0, 'niciun preload de font găsit');
});

guard('niciun HTML din dist/ nu mai referă /hero-youprotect-highvis.webp', () => {
  for (const f of pages()) assert.ok(!read(f).includes('hero-youprotect-highvis.webp'), `${f} referă eroul vechi`);
});

for (const brand of ['mascot', 'portwest', 'sir-safety']) {
  guard(`/produse/${brand}/: grila înaintea pozei, o singură poză de acțiune, lazy`, () => {
    const h = page(`produse/${brand}`);
    const grid = h.indexOf('aria-label="Modele');
    const imgs = [...h.matchAll(/<img\b[^>]*\/images\/actiune\/[^>]*>/g)];
    assert.ok(grid > 0, 'grila de produse lipsește');
    assert.equal(imgs.length, 1, 'exact o poză de acțiune pe pagina de marcă');
    assert.ok(imgs[0].index > grid, 'poza trebuie să vină după grilă în DOM');
    assert.match(imgs[0][0], /loading="lazy"/);
    assert.doesNotMatch(imgs[0][0], /fetchpriority="high"/);
  });
}

guard('toate fișierele /images/... din src/srcset există în dist/', () => {
  const missing = [];
  for (const f of pages()) {
    for (const m of read(f).matchAll(/(?:src|srcset)="([^"]*\/images\/[^"]*)"/g)) {
      for (const part of m[1].split(',')) {
        const url = part.trim().split(/\s+/)[0];
        if (url.startsWith('/images/') && !existsSync(join(DIST, url))) missing.push(`${f.slice(DIST.length)}: ${url}`);
      }
    }
  }
  assert.deepEqual(missing, []);
});

guard('/despre-noi/: portretul fără credit inventat în JSON-LD și fără legendă de credit', () => {
  const h = page('despre-noi');
  const ld = [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  for (const block of ld) assert.ok(!/portret-alexandra/.test(block), 'portretul nu are ce căuta în JSON-LD (fără credit confirmat)');
  const caps = [...h.matchAll(/<figcaption[\s\S]*?<\/figcaption>/g)].map((m) => m[0].replace(/<[^>]+>/g, ' '));
  for (const c of caps) assert.doesNotMatch(c, /Foto\b|©|Credit|Fotografie/i);
  assert.match(h, /alt="Alexandra Pop, fondatoarea You Protect"/);
});
