// Fiecare produs publicat are miniatura de card lângă poza cardului. Fără ea, cardul ar cere o imagine care nu
// există. Dacă testul pică: npm run catalog:cards. Plus: poza pe model (cardColour/cardImage), schema și geometria cardului.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cardColour, cardImage, cardSrc, packshotImage } from '../src/lib/catalog-images.js';
import { productSchema } from '../src/lib/product-schema.ts';
import { toCardProps } from '../src/lib/product-card.ts';
import { CARD_HEIGHT, CARD_WIDTH, contentBox, cropBox, parseFocus, planCard } from '../scripts/catalog/card-layout.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PRODUCTS = join(ROOT, 'src/content/products');
const products = () =>
  readdirSync(PRODUCTS)
    .filter((n) => n.endsWith('.json'))
    .map((n) => ({ n, data: JSON.parse(readFileSync(join(PRODUCTS, n), 'utf8')) }));

test('catalog: cardSrc doar pentru pozele locale de produs', () => {
  assert.equal(cardSrc('/images/products/geaca-x/09-PS.webp'), '/images/products/geaca-x/09-PS-card.webp');
  assert.equal(cardSrc('/images/products/geaca-x/09-PS-card.webp'), '/images/products/geaca-x/09-PS-card.webp');
  assert.equal(cardSrc('https://exemplu.ro/poza.webp'), 'https://exemplu.ro/poza.webp');
  assert.equal(cardSrc('/images/products/../../secret.webp'), '/images/products/../../secret.webp');
  assert.equal(cardSrc(undefined), undefined);
});

test('catalog: fiecare produs publicat are miniatura de card', () => {
  const missing = products()
    .filter(({ data }) => data.status === 'published')
    .map(({ n, data }) => ({ n, src: cardImage(data).src }))
    .filter(({ src }) => cardSrc(src) !== src && !existsSync(join(ROOT, 'public', cardSrc(src))))
    .map(({ n, src }) => `${n}: ${cardSrc(src)}`);
  assert.deepEqual(missing, []);
});

// --- poza pe model -------------------------------------------------------------------------------------------------

const img = (name, extra = {}) => ({
  src: `/images/products/x-test/${name}.webp`,
  thumb: `/images/products/x-test/${name}-thumb.webp`,
  view: name,
  ...extra,
});
const withPerson = () => ({
  cardColour: '01',
  colours: [
    { code: '14010', images: [img('14010-PS')] },
    { code: '01', images: [img('01-C0123abcd', { kind: 'scena', focus: '60% 35%', alt: 'Geacă purtată pe șantier' }), img('01-PS')] },
  ],
});

test('catalog: fără cardPhoto, cardColour/cardImage cad pe colours[0].images[0]', () => {
  for (const { n, data } of products().filter(({ data }) => data.cardColour === undefined)) {
    assert.equal(cardColour(data), data.colours[0], n);
    assert.equal(cardImage(data).src, data.colours[0].images[0].src, n);
    assert.equal(cardImage(data).kind, 'packshot', n);
    assert.equal(packshotImage(data).src, data.colours[0].images[0].src, n);
  }
  const plain = { cardColour: null, colours: [{ code: 'A', images: [img('A-PS')] }] };
  assert.equal(cardImage(plain).src, plain.colours[0].images[0].src);
});

test('catalog: cu cardPhoto, cardul trece pe culoarea aleasă; packshot-ul culorii principale rămâne pentru og și categorii', () => {
  const data = withPerson();
  assert.equal(cardColour(data).code, '01');
  assert.deepEqual(cardImage(data), {
    src: '/images/products/x-test/01-C0123abcd.webp',
    kind: 'scena',
    focus: '60% 35%',
    alt: 'Geacă purtată pe șantier',
    colour: '01',
  });
  assert.equal(packshotImage(data).src, '/images/products/x-test/14010-PS.webp');
  // cardColour necunoscut: cade pe colours[0] (schema pică oricum, vezi mai jos)
  assert.equal(cardColour({ ...data, cardColour: 'zz' }).code, '14010');
});

test('catalog: toCardProps dă poza cardului, tipul, alt-ul și packshot-ul pentru dale', () => {
  const entry = {
    id: 'geaca-test',
    data: { name: 'Geacă test', category: 'geci-jachete', supplier: { brand: 'MASCOT®' }, certifications: [], ...withPerson() },
  };
  const props = toCardProps(entry);
  assert.equal(props.image, '/images/products/x-test/01-C0123abcd-card.webp');
  assert.equal(props.imageKind, 'scena');
  assert.equal(props.imageAlt, 'Geacă purtată pe șantier');
  assert.equal(props.packshot, '/images/products/x-test/14010-PS-card.webp');
});

// --- schema ----------------------------------------------------------------------------------------------------------

test('schema: toate JSON-urile rămân valide; fără cardPhoto: kind=packshot și cardColour=null; cu cardPhoto: prima poză a culorii e studio/scenă, cu alt', () => {
  for (const { n, data } of products()) {
    const parsed = productSchema.safeParse(data);
    assert.ok(parsed.success, `${n}: ${parsed.success ? '' : JSON.stringify(parsed.error.issues.slice(0, 2))}`);
    if (data.cardColour === undefined) {
      assert.equal(parsed.data.cardColour, null, n);
      assert.ok(parsed.data.colours.every((c) => c.images.every((i) => i.kind === 'packshot')), n);
    } else {
      const first = cardImage(parsed.data);
      assert.notEqual(first.kind, 'packshot', n);
      assert.ok(first.alt && first.alt.length >= 20, `${n}: poza pe model are nevoie de alt`);
    }
  }
});

test('catalog: cele 6 produse Sir Safety cu om pe poză sunt recunoscute ca studio, pe poza lor existentă', () => {
  const expected = {
    'geaca-ploaie-sir-safety-suncity-mc4314': 'Q5',
    'combinezon-antistatic-tip-5-6-sir-safety-chemstat-mc3443': 'P0',
    'combinezon-protectie-biologica-tip-4b-sir-safety-virus-8700-mc3441': 'K1',
    'combinezon-protectie-biologica-tip-5b-6b-sir-safety-virus-8500-mc3439': 'K1',
    'combinezon-protectie-chimica-tip-3b-sir-safety-chemical-bio-mc3422': 'E0',
    'combinezon-protectie-tip-5-6-sir-safety-chemtex-mc3442': 'K1',
  };
  for (const [slug, colour] of Object.entries(expected)) {
    const data = JSON.parse(readFileSync(join(PRODUCTS, `${slug}.json`), 'utf8'));
    const card = cardImage(data);
    assert.equal(data.cardColour, colour, slug);
    assert.equal(card.kind, 'studio', slug);
    assert.equal(card.src, `/images/products/${slug}/${colour}-PS.webp`, `${slug}: poza existentă, neschimbată`);
  }
});

function sample() {
  const { data } = products().find(({ data }) => data.colours.length > 1) ?? products()[0];
  return structuredClone(data);
}
const issues = (data) => {
  const r = productSchema.safeParse(data);
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
};

test('schema: cardColour inexistent, scenă fără focus și cardColour pe packshot pică; scena cu focus trece', () => {
  const base = sample();
  const code = base.colours[0].code;
  const person = (kind, focus) => ({ ...img('person'), kind, ...(focus ? { focus } : {}), alt: 'Produs purtat pe șantier' });

  const ok = structuredClone(base);
  ok.colours[0].images.unshift(person('scena', '50% 40%'));
  ok.cardColour = code;
  assert.deepEqual(issues(ok), []);

  const unknown = structuredClone(ok);
  unknown.cardColour = 'nu-exista';
  assert.match(issues(unknown).join('\n'), /cardColour.*nu există în colours/);

  const noFocus = structuredClone(ok);
  delete noFocus.colours[0].images[0].focus;
  assert.match(issues(noFocus).join('\n'), /focus.*scenă/);

  const studio = structuredClone(ok);
  studio.colours[0].images[0] = person('studio');
  assert.deepEqual(issues(studio), [], 'studio nu cere focus');

  const onPackshot = structuredClone(base);
  onPackshot.cardColour = code;
  assert.match(issues(onPackshot).join('\n'), /studio sau scenă/);

  const badFocus = structuredClone(ok);
  badFocus.colours[0].images[0].focus = 'la mijloc';
  assert.ok(issues(badFocus).length > 0);
});

// --- geometria cardului ----------------------------------------------------------------------------------------------

test('card: focus-ul se parsează strict', () => {
  assert.deepEqual(parseFocus('62% 30%'), { x: 0.62, y: 0.3 });
  assert.deepEqual(parseFocus(undefined), { x: 0.5, y: 0.5 });
  for (const bad of ['62 30', '120% 5%', '50%,50%', 'x% y%', '']) assert.throws(() => parseFocus(bad), /focus invalid/);
});

test('card: scena se decupează 4:5 după focus și rămâne în imagine', () => {
  // original lat 1800×1200: decupaj de 960×1200 (4:5)
  assert.deepEqual(cropBox(1800, 1200, '50% 50%'), { left: 420, top: 0, width: 960, height: 1200 });
  assert.deepEqual(cropBox(1800, 1200, '0% 0%'), { left: 0, top: 0, width: 960, height: 1200 });
  assert.deepEqual(cropBox(1800, 1200, '100% 100%'), { left: 840, top: 0, width: 960, height: 1200 });
  // original înalt 1200×2000: decupaj de 1200×1500, pe verticală după focus
  assert.deepEqual(cropBox(1200, 2000, '50% 10%'), { left: 0, top: 0, width: 1200, height: 1500 });
  assert.deepEqual(cropBox(1200, 2000, '50% 90%'), { left: 0, top: 500, width: 1200, height: 1500 });
  for (const [w, h, f] of [[1800, 1200, '30% 70%'], [1200, 2000, '80% 60%'], [1600, 1600, '10% 90%'], [999, 1333, '50% 50%']]) {
    const c = cropBox(w, h, f);
    assert.ok(c.left >= 0 && c.top >= 0 && c.left + c.width <= w && c.top + c.height <= h, `${w}×${h} ${f}`);
    assert.ok(Math.abs(c.width / c.height - 0.8) < 0.002, `${w}×${h}: raport ${c.width / c.height}`);
  }
  assert.equal(planCard({ width: 1800, height: 1200, kind: 'scena', focus: '50% 50%' }).mode, 'crop');
});

test('card: packshot și studio încap întregi, centrate, cu margine de 12 % în cutia 600×750', () => {
  assert.equal(CARD_WIDTH, 600);
  assert.equal(CARD_HEIGHT, 750);
  for (const kind of ['packshot', 'studio']) {
    for (const [w, h] of [[1200, 1200], [1200, 900], [900, 1200], [1100, 1100], [300, 300]]) {
      const p = planCard({ width: w, height: h, kind });
      assert.equal(p.mode, 'contain');
      assert.ok(p.left >= 72 && p.top >= 72, `${kind} ${w}×${h}: margine ${p.left}/${p.top}`);
      assert.ok(p.left + p.width <= 600 - 72 && p.top + p.height <= 750 - 72, `${kind} ${w}×${h}: depășește cutia`);
      assert.ok(Math.abs(p.left - (600 - p.width - p.left)) <= 1 && Math.abs(p.top - (750 - p.height - p.top)) <= 1, 'centrat');
      assert.ok(p.width <= w && p.height <= h, 'fără mărire');
    }
  }
  assert.throws(() => planCard({ width: 0, height: 10 }));
});

// --- tăierea marginilor albe la studio -------------------------------------------------------------------------------

/** Imagine RGB albă width×height cu un dreptunghi negru [x0,x1)×[y0,y1). */
function whiteWith(width, height, [x0, y0, x1, y1], channels = 3, background = 255) {
  const px = new Uint8Array(width * height * channels).fill(background);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) for (let c = 0; c < channels; c++) px[(y * width + x) * channels + c] = 0;
  return px;
}

test('card: contentBox taie marginile aproape-albe, ignoră zgomotul și lasă imaginea întreagă fără conținut', () => {
  const px = whiteWith(1100, 1100, [400, 50, 700, 1050]);
  assert.deepEqual(contentBox(px, 1100, 1100, 3), { left: 400, top: 50, width: 300, height: 1000 });
  // aproape-alb (252) intră în toleranță: nu lărgește caseta
  px[(10 * 1100 + 10) * 3] = 252;
  px[(10 * 1100 + 10) * 3 + 1] = 252;
  px[(10 * 1100 + 10) * 3 + 2] = 252;
  assert.deepEqual(contentBox(px, 1100, 1100, 3), { left: 400, top: 50, width: 300, height: 1000 });
  // un singur pixel întunecat izolat e zgomot (praf), nu siluetă
  px[(5 * 1100 + 5) * 3] = 0;
  assert.deepEqual(contentBox(px, 1100, 1100, 3), { left: 400, top: 50, width: 300, height: 1000 });
  assert.deepEqual(contentBox(whiteWith(20, 30, [0, 0, 0, 0]), 20, 30, 3), { left: 0, top: 0, width: 20, height: 30 });
  // fundal gri (studio MASCOT): nu se taie nimic
  assert.deepEqual(contentBox(whiteWith(40, 40, [0, 0, 0, 0], 3, 200), 40, 40, 3), { left: 0, top: 0, width: 40, height: 40 });
  // RGBA: pixelii transparenți sunt fundal, oricare ar fi culoarea lor
  const rgba = new Uint8Array(10 * 10 * 4);
  for (let y = 2; y < 6; y++) for (let x = 3; x < 8; x++) rgba.set([10, 10, 10, 255], (y * 10 + x) * 4);
  assert.deepEqual(contentBox(rgba, 10, 10, 4), { left: 3, top: 2, width: 5, height: 4 });
  assert.throws(() => contentBox(new Uint8Array(5), 10, 10, 3), /pixeli invalizi/);
});

test('card: studio cu siluetă îngustă pe pătrat alb umple cutia după tăiere; packshot-ul rămâne netăiat', () => {
  const content = { left: 400, top: 50, width: 300, height: 1000 };
  const studio = planCard({ width: 1100, height: 1100, kind: 'studio', content });
  assert.equal(studio.mode, 'contain');
  assert.deepEqual(studio.extract, content);
  assert.equal(studio.height, 606); // cutia 456×606: silueta ocupă toată înălțimea utilă
  assert.equal(studio.width, 182);
  assert.equal(studio.top, 72);
  const withoutTrim = planCard({ width: 1100, height: 1100, kind: 'studio' });
  // înălțimea siluetei pe card: 606 px după tăiere față de 456 × 1000/1100 ≈ 415 px fără tăiere
  assert.ok(studio.height > ((withoutTrim.height * content.height) / 1100) * 1.4, 'tăierea mărește silueta pe card');
  // packshot: `content` ignorat, geometria de dinainte
  assert.deepEqual(planCard({ width: 1100, height: 1100, kind: 'packshot', content }), withoutTrim);
  // fără mărire peste sursă: silueta mică de 100×200 rămâne 100×200
  const small = planCard({ width: 1100, height: 1100, kind: 'studio', content: { left: 0, top: 0, width: 100, height: 200 } });
  assert.deepEqual([small.width, small.height], [100, 200]);
});
