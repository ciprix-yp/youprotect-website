// „Catalog cu omul îmbrăcat”: poza pe model pe card și prima în galeria fișei. Testele rulează pe TOATE produsele
// (setul cu poză pe model se calculează din date, nu e o listă hardcodată: scenele MASCOT vor apărea într-un commit
// ulterior), pe src/content/products, pe public/images/products și pe dist/.
// Ca tests/poze-actiune.test.mjs: fără dist/ testele pe dist sar; cu POZE_REQUIRE_DIST=1 pică.
// Regulile sunt în scripts/catalog/card-checks.mjs (funcții pure), iar cazurile greșite le dovedesc în secțiunea „mutații”.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { cardImage, cardSrc, packshotImage } from '../src/lib/catalog-images.js';
import { toCardProps } from '../src/lib/product-card.ts';
import {
  FOOTWEAR,
  OWNER_EXCLUDED,
  allImages,
  articleCode,
  cardShowsPerson,
  checkAlt,
  checkAlts,
  checkCardColour,
  checkNoPersonPhoto,
  hasPersonPhoto,
  kindOf,
} from '../scripts/catalog/card-checks.mjs';
import { FORBIDDEN_CHUNKS, riffChunks } from '../scripts/catalog/webp-riff.mjs';
import { reportRows } from '../scripts/catalog/card-report.mjs';
import { EAGER_CARDS } from '../src/lib/card-priority.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PRODUCTS = join(ROOT, 'src/content/products');
const IMAGES = join(ROOT, 'public/images/products');
const DIST = join(ROOT, 'dist');
const HAS_DIST = existsSync(DIST) && statSync(DIST).isDirectory();
const REQUIRE_DIST = process.env.POZE_REQUIRE_DIST === '1';

const products = readdirSync(PRODUCTS)
  .filter((n) => n.endsWith('.json'))
  .sort()
  .map((n) => ({ slug: n.slice(0, -5), data: JSON.parse(readFileSync(join(PRODUCTS, n), 'utf8')) }));
const withPerson = products.filter(({ data }) => cardShowsPerson(data));

function distTest(name, fn) {
  test(name, async (t) => {
    if (!HAS_DIST) {
      if (REQUIRE_DIST) assert.fail('POZE_REQUIRE_DIST=1, dar dist/ lipsește: rulează `npm run build`');
      t.skip('fără dist/');
      return;
    }
    await fn();
  });
}

const read = (path) => readFileSync(path, 'utf8');
// De-escapare într-un singur pas (o hartă de entități, un singur `replace`), ca „&amp;quot;” să rămână „&quot;”.
const ENTITIES = { '&quot;': '"', '&#39;': "'", '&amp;': '&', '&lt;': '<', '&gt;': '>' };
const decode = (s) => s.replace(/&(?:quot|#39|amp|lt|gt);/g, (entity) => ENTITIES[entity]);
/** Valoarea atributului `name` dintr-un tag (atributele vin în HTML generat, cu ghilimele duble). */
const attr = (tag, name) => {
  for (const m of tag.matchAll(/\s([a-z-]+)="([^"]*)"/g)) if (m[1] === name) return decode(m[2]);
  return null;
};

/** Cardurile din /produse/ după slug: cutia (div cu data-vt-photo) și <img>-ul din ea. */
function catalogCards() {
  const html = read(join(DIST, 'produse/index.html'));
  const cards = new Map();
  for (const m of html.matchAll(/data-vt-photo="([^"]+)"/g)) {
    const box = html.slice(html.lastIndexOf('<div', m.index), html.indexOf('>', m.index) + 1);
    const img = /<img\b[^>]*>/.exec(html.slice(m.index))[0];
    cards.set(m[1], { box, img, src: attr(img, 'src'), alt: attr(img, 'alt'), width: attr(img, 'width'), height: attr(img, 'height') });
  }
  return cards;
}
const productPage = (slug) => read(join(DIST, 'produse', slug, 'index.html'));

test('set: produsele cu poză pe model nu e gol și coincide cu cardImage', () => {
  assert.ok(products.length >= 75, `catalogul are ${products.length} produse, cel puțin 75`);
  assert.ok(withPerson.length >= 10, `pe model sunt ${withPerson.length} produse; după commit-ul cu MASCOT vor fi mai multe, niciodată mai puține de 10`);
  for (const { slug, data } of products) assert.equal(hasPersonPhoto(data), cardShowsPerson(data), `${slug}: poză pe model în colours[] fără cardColour (sau invers)`);
});

// a. culoarea pozei pe model e în culorile produsului ---------------------------------------------------------------

test('a. cardColour există în colours[] și prima poză a culorii e pe model', () => {
  for (const { slug, data } of products) assert.deepEqual(checkCardColour(data), [], slug);
});

distTest('a. dist: cardul afișează poza culorii-card, nu colours[0]', () => {
  const cards = catalogCards();
  for (const { slug } of products) assert.ok(cards.has(slug), `${slug}: lipsește cardul din /produse/`);
  for (const { slug, data } of withPerson) {
    const expected = cardSrc(data.colours.find((c) => c.code === data.cardColour).images[0].src);
    assert.equal(cards.get(slug).src, expected, slug);
    assert.equal(expected, cardSrc(cardImage(data).src), `${slug}: cardImage și cardColour diferă`);
  }
});

// b. + c. excluderile ---------------------------------------------------------------------------------------------

test('b. MASCOT 19035 și 20382 nu au poză pe model (date)', () => {
  const excluded = products.filter(({ slug }) => articleCode(slug) in OWNER_EXCLUDED);
  assert.deepEqual(excluded.map(({ slug }) => articleCode(slug)).sort(), Object.keys(OWNER_EXCLUDED).sort(), 'produsele excluse există în catalog');
  for (const { slug, data } of excluded) {
    assert.equal(data.cardColour ?? null, null, slug);
    assert.ok(allImages(data).every((i) => kindOf(i) === 'packshot'), `${slug}: imagine pe model`);
  }
});

distTest('b. dist: cardurile 19035 și 20382 sunt pe packshot', () => {
  const cards = catalogCards();
  for (const { slug, data } of products.filter(({ slug }) => articleCode(slug) in OWNER_EXCLUDED)) {
    assert.equal(cards.get(slug).src, cardSrc(data.colours[0].images[0].src), slug);
    assert.doesNotMatch(cards.get(slug).src, /-C[0-9a-f]{8}/, `${slug}: poză-sursă pe card`);
  }
});

test('c. încălțămintea nu are poză pe model (date)', () => {
  const shoes = products.filter(({ data }) => FOOTWEAR.has(data.category));
  assert.ok(shoes.length >= 10, 'încălțămintea există în catalog');
  for (const { slug, data } of shoes) assert.deepEqual(checkNoPersonPhoto(slug, data), []);
  for (const { slug, data } of products) assert.deepEqual(checkNoPersonPhoto(slug, data), [], slug);
});

distTest('c. dist: cardurile de încălțăminte sunt pe packshot', () => {
  const cards = catalogCards();
  for (const { slug, data } of products.filter(({ data }) => FOOTWEAR.has(data.category))) {
    assert.equal(cards.get(slug).src, cardSrc(data.colours[0].images[0].src), slug);
  }
});

// d. card și galerie ------------------------------------------------------------------------------------------------

distTest('d. dist: prima poză din galerie = poza cardului, pentru toate produsele; card 4:5 cu data-vt-photo', () => {
  const cards = catalogCards();
  for (const { slug } of products) {
    const card = cards.get(slug);
    assert.ok(card, `${slug}: lipsește cardul`);
    assert.match(card.box, /data-vt-photo=/, slug);
    assert.match(card.box, /aspect-\[4\/5\]/, `${slug}: cutia cardului nu e 4:5`);
    assert.equal(card.width, '600', slug);
    assert.equal(card.height, '750', slug);

    const html = productPage(slug);
    const well = /<div id="gallery-well"[^>]*>/.exec(html)?.[0];
    assert.ok(well, `${slug}: lipsește #gallery-well`);
    assert.match(well, /aspect-\[4\/5\]/, `${slug}: #gallery-well nu e 4:5`);
    const main = /<img id="gallery-main"[^>]*>/.exec(html)?.[0];
    assert.ok(main, `${slug}: lipsește #gallery-main`);
    // Cardul folosește „-card.webp”; galeria poate folosi originalul (scene): comparăm după cardSrc.
    assert.equal(cardSrc(attr(main, 'src')), cardSrc(card.src), `${slug}: galeria pornește pe altă poză decât cardul`);
  }
});

// scara omului la schimbarea culorii (Sir Safety nu are packshot separat: pozele de culoare sunt singurele) ----------

test('Sir Safety: prima poză a fiecărei culori are același fel (toate pe model sau toate packshot), aceeași scară', () => {
  const bad = [];
  for (const { slug, data } of products) {
    const firsts = data.colours.map((c) => c.images[0]);
    if (!slug.includes('-sir-safety-') || data.colours.length < 2) continue;
    if (new Set(firsts.map(kindOf)).size > 1) bad.push(`${slug}: ${firsts.map((i, n) => `${data.colours[n].code}=${kindOf(i)}`).join(' ')}`);
  }
  assert.deepEqual(bad, []);
  // Suncity MC4314: toate cele 3 culori sunt om pe fond transparent
  const suncity = products.find(({ slug }) => slug.endsWith('-mc4314')).data;
  assert.deepEqual(suncity.colours.map((c) => `${c.code}:${kindOf(c.images[0])}`), ['Q5:studio', 'H1:studio', 'K1:studio']);
});

test('studio = fond alb pur sau transparent (colțurile poza-sursă); fondul gri se declară „scena”', async () => {
  const bad = [];
  for (const { slug, data } of products) {
    for (const image of allImages(data).filter((i) => kindOf(i) === 'studio')) {
      const { data: px, info } = await sharp(join(ROOT, 'public', image.src)).flatten({ background: '#ffffff' }).raw().toBuffer({ resolveWithObject: true });
      for (const [x, y] of [[2, 2], [info.width - 3, 2], [2, info.height - 3], [info.width - 3, info.height - 3]]) {
        const o = (y * info.width + x) * info.channels;
        if (Math.min(px[o], px[o + 1], px[o + 2]) < 250) bad.push(`${slug}: ${image.src} colț (${x},${y}) nu e alb`);
      }
    }
  }
  assert.deepEqual(bad, []);
});

test('focus e rezervat la studio: pozele studio nu poartă focus, scenele da', () => {
  for (const { slug, data } of products) {
    for (const image of allImages(data)) {
      if (kindOf(image) === 'studio') assert.equal(image.focus, undefined, `${slug}: ${image.src} are focus la studio (ignorat)`);
      if (kindOf(image) === 'scena') assert.match(image.focus ?? '', /^\d{1,3}% \d{1,3}%$/, `${slug}: scena fără focus`);
    }
  }
});

// e. alt-uri --------------------------------------------------------------------------------------------------------

test('e. pozele pe model au alt valid (română, 20–140, fără You Protect/angajat/client)', () => {
  for (const { slug, data } of products) assert.deepEqual(checkAlts(data), [], slug);
});

distTest('e. dist: alt-ul cardului = alt-ul din date (model) sau numele produsului (packshot)', () => {
  const cards = catalogCards();
  for (const { slug, data } of products) {
    const props = toCardProps({ id: slug, data });
    const expected = cardShowsPerson(data) ? cardImage(data).alt : data.name;
    assert.ok(expected, `${slug}: fără alt așteptat`);
    assert.equal(cards.get(slug).alt, expected, slug);
    assert.equal(props.imageAlt ?? props.name, expected, slug);
  }
});

// f. pe disc --------------------------------------------------------------------------------------------------------

function webpFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return webpFiles(path);
    return e.name.endsWith('.webp') ? [path] : [];
  });
}

test('f. toate -card.webp au 600×750 și cel mult 60 KB', async () => {
  const cardFiles = webpFiles(IMAGES).filter((f) => f.endsWith('-card.webp'));
  assert.ok(cardFiles.length >= products.length, 'miniaturi de card lipsă');
  const bad = [];
  for (const file of cardFiles) {
    const { width, height } = await sharp(file).metadata();
    const kb = statSync(file).size / 1024;
    if (width !== 600 || height !== 750 || kb > 60) bad.push(`${relative(ROOT, file)}: ${width}×${height}, ${kb.toFixed(1)} KB`);
  }
  assert.deepEqual(bad, []);
});

test('f. pozele pe model (sursă și -card.webp) nu au EXIF, XMP sau ICC', () => {
  const files = new Set();
  for (const { data } of products) {
    for (const image of allImages(data).filter((i) => kindOf(i) !== 'packshot')) {
      files.add(join(ROOT, 'public', image.src));
      files.add(join(ROOT, 'public', cardSrc(image.src)));
    }
  }
  assert.ok(files.size >= 2 * withPerson.length, 'fișiere de verificat');
  const dirty = [];
  for (const file of files) {
    assert.ok(existsSync(file), `lipsește ${relative(ROOT, file)}`);
    if (riffChunks(readFileSync(file)).some((n) => FORBIDDEN_CHUNKS.has(n))) dirty.push(relative(ROOT, file));
  }
  assert.deepEqual(dirty, []);
});

// g. og:image și dalele rămân pe packshot ---------------------------------------------------------------------------

// Doar produsele cu packshot separat în colours[0] (Portwest). Sir Safety nu are packshot separat: singura poză a
// culorii e cea pe model (studio), deci og:image și dalele de categorie folosesc inevitabil poza pe model.
const withSeparatePackshot = withPerson.filter(({ data }) => data.colours[0].images.some((i) => kindOf(i) === 'packshot'));

distTest('g. dist: og:image al fișei e packshot-ul, nu poza pe model (produsele cu packshot separat)', () => {
  assert.ok(withSeparatePackshot.length >= 4, 'Portwest cu poză pe model și packshot separat: CS10, CS11, S476, T501');
  for (const { slug, data } of withSeparatePackshot) {
    const og = /<meta property="og:image" content="([^"]+)"/.exec(productPage(slug))?.[1];
    assert.ok(og?.endsWith(packshotImage(data).src), `${slug}: og:image ${og}`);
    assert.equal(kindOf(packshotImage(data)), 'packshot', slug);
    assert.ok(!og.includes('-C'), `${slug}: og:image pe poza-sursă a modelului`);
  }
});

distTest('g. dist: dalele de categorie nu folosesc poza pe model (produsele cu packshot separat)', () => {
  const personSrcs = new Set(withSeparatePackshot.map(({ data }) => cardSrc(cardImage(data).src)));
  // Hub-ul /produse/ și paginile de categorie/marcă (cele cu grila „Modele…”); paginile de produs au altă structură.
  const listing = ['produse/index.html', ...readdirSync(join(DIST, 'produse')).map((d) => `produse/${d}/index.html`)].filter(
    (p) => existsSync(join(DIST, p)) && (p === 'produse/index.html' || /aria-label="Modele/.test(read(join(DIST, p)))),
  );
  assert.ok(listing.length >= 9, `pagini de listare: ${listing.length}`);
  for (const p of listing) {
    const html = read(join(DIST, p));
    const beforeGrid = html.slice(0, html.indexOf('<article') === -1 ? html.length : html.indexOf('<article'));
    for (const m of beforeGrid.matchAll(/<img\b[^>]*>/g)) {
      assert.ok(!personSrcs.has(cardSrc(attr(m[0], 'src'))), `${p}: dală cu poza pe model ${attr(m[0], 'src')}`);
    }
  }
});

// h. regula #93: grila de produse e primul bloc de conținut, fără poze deasupra ---------------------------------------

// tests/qa-pr104-dist.test.mjs verifică în plus poza de acțiune de pe paginile de marcă. Aici: pe TOATE paginile
// de categorie și de marcă (cele cu grila „Modele…”), între <main> și grilă nu există <img>/<picture>. Hub-ul
// /produse/ are dale de categorie cu poze înaintea grilei, prin design, deci nu intră.
distTest('h. paginile de categorie și de marcă: nicio <img>/<picture> între <main> și grila de produse', () => {
  const pages = readdirSync(join(DIST, 'produse'), { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(DIST, 'produse', e.name, 'index.html')))
    .map((e) => e.name)
    .filter((name) => /aria-label="Modele/.test(read(join(DIST, 'produse', name, 'index.html'))));
  assert.ok(pages.length >= 8, `pagini de categorie/marcă găsite: ${pages.length}`);
  for (const name of pages) {
    const html = read(join(DIST, 'produse', name, 'index.html'));
    const start = html.indexOf('<main');
    const grid = html.indexOf('aria-label="Modele');
    assert.ok(start > -1 && grid > start, `${name}: grila lipsește`);
    assert.doesNotMatch(html.slice(start, grid), /<(img|picture)\b/, `produse/${name}/: poză deasupra grilei`);
  }
});

// mutații: regulile pică pe date greșite -------------------------------------------------------------------------------

const img = (name, extra = {}) => ({ src: `/images/products/x/${name}.webp`, thumb: `/images/products/x/${name}-thumb.webp`, view: name, ...extra });
const good = () => ({
  category: 'geci-jachete',
  cardColour: '01',
  colours: [
    { code: '14', images: [img('14-PS')] },
    { code: '01', images: [img('01-Cabcdef12', { kind: 'studio', alt: 'Geaca Exemplu, purtată de un om pe șantier' }), img('01-PS')] },
  ],
});

test('mutații: datele corecte trec', () => {
  const data = good();
  assert.deepEqual(checkCardColour(data), []);
  assert.deepEqual(checkAlts(data), []);
  assert.deepEqual(checkNoPersonPhoto('geaca-exemplu-12345', data), []);
});

test('mutații: cardColour în afara colours[] pică', () => {
  const data = { ...good(), cardColour: '99' };
  assert.match(checkCardColour(data)[0], /nu e printre culorile produsului/);
});

test('mutații: prima poză a culorii-card pe packshot pică', () => {
  const data = good();
  data.colours[1].images.reverse();
  assert.match(checkCardColour(data)[0], /nu e pe model/);
});

test('mutații: 19035 și 20382 cu cardColour sau poză pe model pică', () => {
  for (const code of Object.keys(OWNER_EXCLUDED)) {
    assert.match(checkNoPersonPhoto(`geaca-mascot-${code}`, good())[0], /cardColour „01”/);
    const noColour = { ...good(), cardColour: null };
    assert.match(checkNoPersonPhoto(`geaca-mascot-${code}`, noColour)[0], /imagine studio/);
  }
  assert.deepEqual(checkNoPersonPhoto('geaca-mascot-18015', good()), [], 'alt produs MASCOT nu e exclus');
});

test('mutații: încălțămintea cu poză pe model pică', () => {
  assert.ok(checkNoPersonPhoto('bocanci-x-portwest-fd25', { ...good(), category: 'incaltaminte' }).length > 0);
  assert.ok(checkNoPersonPhoto('pantofi-x-mascot-f3003', { ...good(), category: 'incaltaminte-business' }).length > 0);
});

test('mutații: alt-uri greșite pică', () => {
  const ok = 'Geaca Exemplu, purtată de un om pe șantier';
  assert.deepEqual(checkAlt(ok), []);
  assert.match(checkAlt('Geaca You Protect, purtată de un om pe șantier')[0], /interzis/);
  assert.match(checkAlt('Geaca purtată de un angajat pe șantier, în Satu Mare')[0], /interzis/);
  assert.match(checkAlt('Geaca purtată de un client mulțumit pe șantier')[0], /interzis/);
  assert.match(checkAlt('Testimonial: geaca purtată pe șantier de un om')[0], /interzis/);
  assert.match(checkAlt('geaca exemplu, purtată de un om pe șantier')[0], /literă mică/);
  assert.match(checkAlt('Worker wearing the jacket on a building site')[0], /englezesc/);
  assert.match(checkAlt('Geacă purtată')[0], /caractere/);
  assert.match(checkAlt(`Geaca purtată ${'foarte '.repeat(30)}departe`)[0], /caractere/);
  assert.match(checkAlt('Geaca Exemplu, purtată de un om pe şantier')[0], /sedilă/);
  assert.deepEqual(checkAlt(undefined), ['alt lipsește']);
  const data = good();
  data.colours[1].images[0].alt = 'Geaca You Protect, purtată de un om pe șantier';
  assert.match(checkAlts(data)[0], /interzis/);
});

// raportul ----------------------------------------------------------------------------------------------------------

test('card-report: fiecare produs pe packshot are un motiv, iar cele cu poză pe model nu au intrare', () => {
  const reasons = JSON.parse(readFileSync(join(ROOT, 'catalog/maps/card-photo-reasons.json'), 'utf8'));
  delete reasons._nota;
  const rows = reportRows();
  assert.equal(rows.length, products.length);
  const slugs = new Set(products.map((p) => p.slug));
  for (const slug of Object.keys(reasons)) assert.ok(slugs.has(slug), `motiv pentru un produs inexistent: ${slug}`);
  for (const row of rows) {
    if (row.card === 'packshot') assert.ok(reasons[row.slug]?.trim(), `${row.slug}: card pe packshot fără motiv`);
    else assert.equal(reasons[row.slug], undefined, `${row.slug}: are poză pe model, dar și un motiv de packshot`);
  }
});

// LCP: primele carduri din grilă sunt eager (primul și fetchpriority high), restul lazy -----------------------------

const GRID_PAGES = [
  '',
  ...['bluze-si-hanorace-de-lucru', 'camasi-corporate', 'casti-de-protectie', 'combinezoane-de-protectie', 'geci-de-lucru', 'hamuri-de-siguranta',
    'imbracaminte-reflectorizanta', 'incaltaminte-de-protectie', 'manusi-de-protectie', 'masti-de-protectie', 'ochelari-de-protectie',
    'pantaloni-de-lucru', 'tricouri-polo-de-lucru', 'veste-de-lucru', 'mascot', 'portwest', 'sir-safety'],
];

distTest('LCP: categorii și mărci au primul card eager + fetchpriority high, restul lazy; hub-ul nu are niciun card eager', () => {
  for (const page of GRID_PAGES) {
    const html = read(join(DIST, 'produse', page, 'index.html'));
    const imgs = [...html.matchAll(/data-vt-photo="[a-z0-9-]+"/g)].map((m) => /<img\b[^>]*>/.exec(html.slice(m.index))[0]);
    assert.ok(imgs.length >= 1, `produse/${page}: nu are carduri în grilă`);
    imgs.forEach((img, i) => {
      const where = `produse/${page || '(hub)'} cardul ${i}`;
      const first = page !== '' && i < EAGER_CARDS;
      assert.equal(attr(img, 'loading'), first ? 'eager' : 'lazy', where);
      assert.equal(attr(img, 'fetchpriority'), first && i === 0 ? 'high' : null, where);
    });
  }
});
