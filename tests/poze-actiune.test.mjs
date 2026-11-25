// Pozele cu oameni în acțiune (src/data/poze-actiune*.json, public/images/actiune/): integritatea datelor și regulile
// de utilizare, verificate automat prin scanarea sursei. Regulile owner-ului (22.11.2026):
//   1. Portwest (P*) doar lângă produse Portwest: /produse/portwest/, /industrii/logistica/ și paginile de categorie
//      cu cel puțin un produs publicat Portwest (licența: „solely for the marketing, promotion, sale and distribution
//      of Portwest products”).
//   2. Fără credit vizibil sub poze; creditul stă doar în ImageObject (creditText, copyrightNotice, creator), fără license.
//   3. O poză apare pe cel mult 2 pagini, niciodată de 2 ori pe aceeași pagină, niciodată ca erou pe 2 pagini.
//
// TIPARUL de referință (cum „vede” testul o poză folosită; același text e în src/components/media/ActionPhoto.astro):
//   - src/pages/**/*.astro (fără rute dinamice): <ActionPhoto id="M02" … />  (id literal)
//   - erou: `heroPhoto="M02"` / `heroPhoto: 'M02'` sau <ActionPhoto id="M02" priority />; doar pozele cu `erou: true` în date
//   - src/lib/catalog-brands.ts și catalog-categories.ts: `photo: 'S01'` / `heroPhoto: 'M02'` în intrarea cu `slug: '…'`
//     (pagina = /produse/<slug>/); atributul `photo="…"` merge în aceleași fișiere de pagini
//   - id dinamic (<ActionPhoto id={page.photo} />) doar în BrandLanding.astro, CategoryLanding.astro și PageHeader.astro
//     (PageHeader primește id-ul prin `heroPhoto`, scris literal în pagină)
//   - id literal în orice alt fișier (componente, layout-uri) e eroare: pagina nu se poate deduce
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACTION_PHOTOS, imageObject, imageObjects, imageGraph, imageRef, photoSrcset, photoSrc, getPhoto } from '../src/lib/poze-actiune.ts';
import { jsonLd } from '../src/lib/json-ld.ts';
import { SITE } from '../src/lib/site.ts';
import { CATEGORY_PAGES } from '../src/lib/catalog-categories.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const photos = JSON.parse(read('src/data/poze-actiune.json'));
const variants = JSON.parse(read('src/data/poze-actiune-variante.json'));

// ---------------------------------------------------------------------------------------------------------------
// 1. Integritatea datelor

const EXPECTED_IDS = [
  'M01', 'M02', 'M04', 'M05', 'M09', 'M10', 'M12', 'M18', 'M19',
  'P04', 'P05', 'P06', 'P11', 'P13',
  'S01', 'S02', 'S04', 'S06', 'S08', 'S12', 'S14', 'S16',
];
const BRAND = {
  mascot: { suffix: '-mascot', credit: 'MASCOT', prefix: 'M' },
  portwest: { suffix: '-portwest', credit: 'Portwest', prefix: 'P' },
  sirsafety: { suffix: '-sir-safety', credit: 'Sir Safety', prefix: 'S' },
};

/** Dimensiunile unui WebP din antet (VP8, VP8L sau VP8X). */
function webpSize(buf) {
  assert.equal(buf.toString('ascii', 0, 4), 'RIFF');
  assert.equal(buf.toString('ascii', 8, 12), 'WEBP');
  const kind = buf.toString('ascii', 12, 16);
  if (kind === 'VP8 ') return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  if (kind === 'VP8L') {
    const bits = buf.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (kind === 'VP8X') return { width: buf.readUIntLE(24, 3) + 1, height: buf.readUIntLE(27, 3) + 1 };
  throw new Error(`Chunk WebP necunoscut: ${kind}`);
}

test('poze: exact cele 22 de id-uri, fără dubluri, și variante pentru fiecare', () => {
  assert.deepEqual(photos.map((p) => p.id).sort(), [...EXPECTED_IDS].sort());
  assert.deepEqual(Object.keys(variants).sort(), [...EXPECTED_IDS].sort());
  assert.deepEqual(ACTION_PHOTOS.map((p) => p.id), photos.map((p) => p.id));
  assert.equal(new Set(photos.map((p) => p.slug)).size, photos.length);
});

test('poze: fișierele din variante există, sunt WebP, sub 250 KB, cu dimensiunile din JSON', () => {
  for (const [id, list] of Object.entries(variants)) {
    assert.ok(list.length >= 1, `${id}: fără variante`);
    for (const v of list) {
      const path = join(ROOT, 'public/images/actiune', v.file);
      assert.ok(existsSync(path), `${id}: lipsește ${v.file}`);
      const buf = readFileSync(path);
      assert.ok(buf.length < 250 * 1024, `${v.file}: ${Math.round(buf.length / 1024)} KB`);
      assert.equal(buf.length, v.bytes, `${v.file}: bytes din JSON diferă de fișier`);
      assert.deepEqual(webpSize(buf), { width: v.width, height: v.height }, `${v.file}: dimensiuni diferite de JSON`);
      assert.ok(v.file.startsWith(photos.find((p) => p.id === id).slug), `${v.file}: nu începe cu slug-ul pozei`);
    }
  }
});

test('poze: slug-uri fără diacritice, kebab-case, cu brandul la final', () => {
  for (const p of photos) {
    const brand = BRAND[p.furnizor];
    assert.ok(brand, `${p.id}: furnizor necunoscut „${p.furnizor}”`);
    assert.match(p.slug, /^[a-z0-9]+(-[a-z0-9]+)*$/, `${p.id}: slug invalid`);
    assert.ok(p.slug.endsWith(brand.suffix), `${p.id}: slug-ul trebuie să se termine cu ${brand.suffix}`);
    assert.ok(p.id.startsWith(brand.prefix), `${p.id}: prefixul id-ului nu se potrivește furnizorului`);
  }
});

test('poze: alt-ul e nevid, cu diacritice corecte, fără formule interzise și fără cifre', () => {
  const banned = /echipa noastră|clienții noștri|clienţii noştri|angajați/i;
  for (const p of photos) {
    assert.ok(p.alt.trim().length > 10, `${p.id}: alt gol`);
    assert.doesNotMatch(p.alt, /[şţŞŢ]/, `${p.id}: diacritice cu cedilă`);
    assert.doesNotMatch(p.alt, banned, `${p.id}: formulă interzisă în alt`);
    assert.doesNotMatch(p.alt, /\d/, `${p.id}: cifre în alt`);
  }
});

test('poze: creditul corect pe furnizor, fără license/acquireLicensePage nicăieri', () => {
  for (const p of photos) {
    assert.equal(p.creditText, BRAND[p.furnizor].credit, `${p.id}: creditText`);
    assert.equal(p.copyrightNotice, `© ${BRAND[p.furnizor].credit}`, `${p.id}: copyrightNotice`);
    assert.deepEqual(p.creator, { '@type': 'Organization', name: BRAND[p.furnizor].credit }, `${p.id}: creator`);
  }
  const raw = read('src/data/poze-actiune.json') + read('src/data/poze-actiune-variante.json');
  assert.doesNotMatch(raw, /license|acquireLicensePage/i);
  for (const p of photos) assert.doesNotMatch(JSON.stringify(imageObject(p.id)), /license|acquireLicensePage/i);
});

test('poze: helperii (srcset, src, id necunoscut)', () => {
  const id = 'M02';
  const list = variants[id];
  assert.equal(photoSrcset(id).split(', ').length, list.length);
  assert.ok(photoSrcset(id).includes(`/images/actiune/${list[0].file} ${list[0].width}w`));
  assert.ok(photoSrc(id).endsWith(list[list.length - 1].file));
  assert.ok(photoSrc(id, 1).endsWith(list[0].file));
  assert.ok(photoSrc(id, 100000).endsWith(list[list.length - 1].file));
  assert.throws(() => getPhoto('X99'), /X99/);
  assert.throws(() => imageObject('X99'), /X99/);
});

// ---------------------------------------------------------------------------------------------------------------
// 2. Reguli de utilizare: analiza surselor

/** Fișierele unde `<ActionPhoto id={…}>` poate avea id dinamic (primesc pagina din catalog-brands/-categories). */
const DYNAMIC_OK = new Set([
  'src/components/products/BrandLanding.astro',
  'src/components/products/CategoryLanding.astro',
  // Ghidurile: pagina dă `photo="S12"` ca literal pe <GuideLayout>, layout-ul îl randează.
  'src/components/guides/GuideLayout.astro',
  // Eroul paginilor interioare: id-ul vine din `heroPhoto="…"` pus pe pagină (detectat ca erou).
  'src/components/global/PageHeader.astro',
]);
/** Fișierele care definesc sau documentează pozele: nu sunt „utilizări”. */
const NOT_USAGE = new Set(['src/components/media/ActionPhoto.astro', 'src/lib/poze-actiune.ts']);
const CATALOG_FILES = new Set(['src/lib/catalog-brands.ts', 'src/lib/catalog-categories.ts']);
const MAX_PAGES_PER_PHOTO = 2;

const toPosix = (p) => p.split(sep).join('/');

/** src/pages/a/b.astro -> /a/b/ ; index.astro -> /a/ ; null pentru rute dinamice. */
export function routeOf(path) {
  const m = /^src\/pages\/(.+)\.astro$/.exec(path);
  if (!m) return undefined;
  if (m[1].includes('[')) return null;
  const clean = m[1].replace(/(^|\/)index$/, '');
  return clean === '' ? '/' : `/${clean}/`;
}

/** Literal între ghilimele; `n` = numărul grupului ghilimelei în regex-ul întreg (valoarea e grupul n+1). */
const str = (n) => `(["'])([^"']*)\\${n}`;

/**
 * Referințele la poze dintr-o listă de surse [{ path, text }].
 * Întoarce { refs: [{ id, page, hero, file }], problems: string[] }.
 */
export function analyzeUsage(files) {
  const refs = [];
  const problems = [];
  for (const { path, text } of files) {
    if (NOT_USAGE.has(path)) continue;
    const found = []; // { id, hero, index }
    for (const tag of text.matchAll(/<ActionPhoto\b((?:[^>{}]|\{[^{}]*\})*)>/g)) {
      const attrs = tag[1];
      const literal = new RegExp(`\\bid\\s*=\\s*${str(1)}`).exec(attrs);
      if (literal) {
        found.push({ id: literal[2], hero: /\bpriority\b(?!\s*=\s*\{\s*false\s*\})/.test(attrs), index: tag.index });
      } else if (!DYNAMIC_OK.has(path)) {
        problems.push(`${path}: <ActionPhoto> fără id literal (id dinamic doar în BrandLanding/CategoryLanding)`);
      }
    }
    for (const m of text.matchAll(new RegExp(`(?<![-\\w.])(photo|heroPhoto)\\s*[=:]\\s*${str(2)}`, 'g'))) {
      found.push({ id: m[3], hero: m[1] === 'heroPhoto', index: m.index });
    }
    if (found.length === 0) continue;

    if (CATALOG_FILES.has(path)) {
      const slugs = [...text.matchAll(/\bslug:\s*(["'])([^"']+)\1/g)].map((m) => ({ slug: m[2], index: m.index }));
      for (const f of found) {
        const owner = [...slugs].reverse().find((s) => s.index < f.index);
        if (!owner) problems.push(`${path}: poza „${f.id}” fără slug de pagină înaintea ei`);
        else refs.push({ id: f.id, page: `/produse/${owner.slug}/`, hero: f.hero, file: path });
      }
      continue;
    }
    const page = routeOf(path);
    if (!page) {
      problems.push(`${path}: poze („${found.map((f) => f.id).join('”, „')}”) într-un fișier din care nu se deduce pagina`);
      continue;
    }
    for (const f of found) refs.push({ id: f.id, page, hero: f.hero, file: path });
  }
  return { refs, problems };
}

/** Încalcă regulile 3 (pagini, dubluri, erou) și id-urile necunoscute? Întoarce lista de probleme. */
export function usageProblems(refs, photoData) {
  const problems = [];
  const known = new Map(photoData.map((p) => [p.id, p]));
  for (const r of refs) {
    if (!known.has(r.id)) problems.push(`${r.file}: id necunoscut „${r.id}”`);
    else if (r.hero && !known.get(r.id).erou) problems.push(`${r.file}: „${r.id}” nu are voie ca erou (erou: false)`);
  }
  const byId = Map.groupBy(refs, (r) => r.id);
  for (const [id, list] of byId) {
    const pages = list.map((r) => r.page);
    for (const page of new Set(pages)) {
      if (pages.filter((p) => p === page).length > 1) problems.push(`${id}: de două ori pe ${page}`);
    }
    if (new Set(pages).size > MAX_PAGES_PER_PHOTO) {
      problems.push(`${id}: pe ${new Set(pages).size} pagini (max. ${MAX_PAGES_PER_PHOTO}): ${[...new Set(pages)].join(', ')}`);
    }
    const heroPages = new Set(list.filter((r) => r.hero).map((r) => r.page));
    if (heroPages.size > 1) problems.push(`${id}: erou pe ${heroPages.size} pagini: ${[...heroPages].join(', ')}`);
  }
  return problems;
}

/** Regula Portwest: P* doar pe paginile permise. */
export function portwestProblems(refs, portwestCategorySlugs) {
  const allowed = new Set(['/produse/portwest/', '/industrii/logistica/', ...portwestCategorySlugs.map((s) => `/produse/${s}/`)]);
  return refs
    .filter((r) => r.id.startsWith('P') && !allowed.has(r.page))
    .map((r) => `${r.file}: ${r.id} (Portwest) pe ${r.page}, unde nu e pagină cu produse Portwest`);
}

/** Textul vizibil lângă pozele de acțiune și folosirea creditului în afara lib. */
export function creditProblems(files) {
  const problems = [];
  const VISIBLE = /<figcaption|Foto:|Credit:|©/;
  for (const { path, text } of files) {
    if (path === 'src/lib/poze-actiune.ts' || path === 'src/lib/json-ld.ts') continue;
    if (path !== 'src/components/media/ActionPhoto.astro' && /\b(creditText|copyrightNotice)\b/.test(text)) {
      problems.push(`${path}: creditText/copyrightNotice doar în src/lib`);
    }
    if (path === 'src/components/media/ActionPhoto.astro') {
      const markup = text.replace(/^---[\s\S]*?\n---/, '').replace(/<style[\s\S]*?<\/style>/, '');
      if (VISIBLE.test(markup)) problems.push(`${path}: credit vizibil în componentă`);
      continue;
    }
    for (const tag of text.matchAll(/<ActionPhoto\b/g)) {
      const around = text.slice(Math.max(0, tag.index - 400), tag.index + 600);
      if (VISIBLE.test(around)) problems.push(`${path}: figcaption/„Foto:”/„Credit:”/„©” lângă o poză de acțiune`);
    }
  }
  return problems;
}

/** Slug-urile categoriilor cu cel puțin un produs publicat Portwest. */
function portwestCategorySlugs(products) {
  const keys = new Set(products.filter((p) => p.supplier.brand === 'Portwest').map((p) => p.category));
  return CATEGORY_PAGES.filter((c) => keys.has(c.key)).map((c) => c.slug);
}

const products = readdirSync(join(ROOT, 'src/content/products'))
  .filter((n) => n.endsWith('.json'))
  .map((n) => JSON.parse(readFileSync(join(ROOT, 'src/content/products', n), 'utf8')))
  .filter((p) => p.status === 'published');

function walk(dir, ok) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return walk(path, ok);
    return ok(e.name) ? [path] : [];
  });
}
const sourceFiles = walk(join(ROOT, 'src'), (n) => /\.(astro|ts|tsx|js|mjs)$/.test(n)).map((abs) => ({
  path: toPosix(relative(ROOT, abs)),
  text: readFileSync(abs, 'utf8'),
}));

const PHOTOS = photos.map((p) => ({ id: p.id, erou: p.erou }));

test('utilizare: sursa actuală respectă regulile (max. 2 pagini, fără dubluri, erou unic, id-uri valide)', () => {
  const { refs, problems } = analyzeUsage(sourceFiles);
  assert.deepEqual(problems, []);
  assert.deepEqual(usageProblems(refs, PHOTOS), []);
});

const page = (path, body) => ({ path, text: body });
const SYN = (files) => {
  const { refs, problems } = analyzeUsage(files);
  return [...problems, ...usageProblems(refs, PHOTOS)];
};

test('utilizare (negativ): analiza prinde încălcările pe surse sintetice', () => {
  // o poză pe 3 pagini
  assert.match(
    SYN([
      page('src/pages/a.astro', '<ActionPhoto id="M01" sizes="100vw" />'),
      page('src/pages/b.astro', '<ActionPhoto id="M01" sizes="100vw" />'),
      page('src/pages/c/index.astro', '<ActionPhoto\n  id="M01"\n  sizes="100vw"\n/>'),
    ]).join('\n'),
    /M01: pe 3 pagini/,
  );
  // de două ori pe aceeași pagină
  assert.match(
    SYN([page('src/pages/a.astro', '<ActionPhoto id="M01" sizes="x" /><ActionPhoto id="M01" sizes="x" />')]).join('\n'),
    /M01: de două ori pe \/a\//,
  );
  // erou pe 2 pagini
  assert.match(
    SYN([
      page('src/pages/a.astro', '<PageHeader heroPhoto="M02" />'),
      page('src/pages/b.astro', '<ActionPhoto id="M02" sizes="x" priority />'),
    ]).join('\n'),
    /M02: erou pe 2 pagini/,
  );
  // erou pe o poză care nu are voie
  assert.match(SYN([page('src/pages/a.astro', '<PageHeader heroPhoto="M01" />')]).join('\n'), /M01.*nu are voie ca erou/);
  // id inexistent
  assert.match(SYN([page('src/pages/a.astro', '<ActionPhoto id="M99" sizes="x" />')]).join('\n'), /id necunoscut „M99”/);
  assert.match(SYN([page('src/pages/a.astro', '<X photo="m02" />')]).join('\n'), /id necunoscut „m02”/);
  // id dinamic în afara Brand/CategoryLanding; id literal într-o componentă
  assert.match(SYN([page('src/pages/a.astro', '<ActionPhoto id={x} sizes="y" />')]).join('\n'), /fără id literal/);
  assert.match(SYN([page('src/components/global/Footer.astro', '<ActionPhoto id="M01" sizes="y" />')]).join('\n'), /nu se deduce pagina/);
  assert.match(SYN([page('src/pages/produse/[slug].astro', '<ActionPhoto id="M01" sizes="y" />')]).join('\n'), /nu se deduce pagina/);
});

test('utilizare (pozitiv): tiparele valide se rezolvă pe pagina corectă', () => {
  const brands = `export const BRAND_PAGES = [
    { brand: 'MASCOT®', slug: 'mascot', heroPhoto: 'M02', photo: 'M04' },
    { brand: 'Portwest', slug: 'portwest', photo: 'P04' },
  ];`;
  const { refs, problems } = analyzeUsage([
    page('src/lib/catalog-brands.ts', brands),
    page('src/pages/industrii/logistica.astro', '<ActionPhoto id="P05" sizes="x" />'),
    page('src/pages/index.astro', "<ActionPhoto id='S02' sizes=\"x\" />"),
    page('src/components/products/BrandLanding.astro', '<ActionPhoto id={page.photo} sizes="x" />'),
    page('src/components/products/ProductCard.astro', '<a data-vt-photo="abc" />'),
  ]);
  assert.deepEqual(problems, []);
  assert.deepEqual(
    refs.map((r) => `${r.id}@${r.page}${r.hero ? ' hero' : ''}`).sort(),
    ['M02@/produse/mascot/ hero', 'M04@/produse/mascot/', 'P04@/produse/portwest/', 'P05@/industrii/logistica/', 'S02@/'].sort(),
  );
  assert.deepEqual(usageProblems(refs, PHOTOS), []);
});

test('utilizare: rutele se rezolvă din fișierul paginii', () => {
  assert.equal(routeOf('src/pages/index.astro'), '/');
  assert.equal(routeOf('src/pages/despre-noi.astro'), '/despre-noi/');
  assert.equal(routeOf('src/pages/industrii/index.astro'), '/industrii/');
  assert.equal(routeOf('src/pages/produse/[slug].astro'), null);
  assert.equal(routeOf('src/components/x.astro'), undefined);
});

// ---------------------------------------------------------------------------------------------------------------
// 3. Regula Portwest

test('portwest: pozele P* doar pe paginile permise (sursa actuală)', () => {
  const { refs } = analyzeUsage(sourceFiles);
  assert.deepEqual(portwestProblems(refs, portwestCategorySlugs(products)), []);
});

test('portwest: categoriile permise vin din fișele publicate Portwest', () => {
  const slugs = portwestCategorySlugs(products);
  assert.ok(slugs.length > 0, 'nicio categorie cu produse Portwest');
  for (const s of slugs) assert.ok(CATEGORY_PAGES.some((c) => c.slug === s));
  const withoutPortwest = CATEGORY_PAGES.filter((c) => !slugs.includes(c.slug));
  assert.ok(withoutPortwest.length > 0, 'toate categoriile au Portwest: testul negativ de mai jos nu are pe ce rula');
});

test('portwest (negativ): P* pe pagini nepermise pică', () => {
  const slugs = portwestCategorySlugs(products);
  const free = CATEGORY_PAGES.find((c) => !slugs.includes(c.slug)).slug;
  const bad = (path, text) => portwestProblems(analyzeUsage([page(path, text)]).refs, slugs);
  assert.equal(bad('src/pages/ghiduri/s1p-sau-s3.astro', '<ActionPhoto id="P05" sizes="x" />').length, 1);
  assert.equal(bad('src/pages/industrii/constructii.astro', '<ActionPhoto id="P05" sizes="x" />').length, 1);
  assert.equal(bad('src/pages/index.astro', '<PageHeader heroPhoto="P04" />').length, 1);
  assert.equal(bad('src/lib/catalog-brands.ts', `{ slug: 'mascot', photo: 'P06' }`).length, 1);
  assert.equal(bad('src/lib/catalog-categories.ts', `{ slug: '${free}', photo: 'P11' }`).length, 1);
  // permise
  assert.equal(bad('src/pages/industrii/logistica.astro', '<ActionPhoto id="P05" sizes="x" />').length, 0);
  assert.equal(bad('src/lib/catalog-brands.ts', `{ slug: 'portwest', photo: 'P13' }`).length, 0);
  assert.equal(bad('src/lib/catalog-categories.ts', `{ slug: '${slugs[0]}', photo: 'P04' }`).length, 0);
  // Poze non-Portwest oriunde
  assert.equal(bad('src/pages/index.astro', '<ActionPhoto id="M01" sizes="x" />').length, 0);
});

// ---------------------------------------------------------------------------------------------------------------
// 4. Fără credit vizibil

test('credit: nimic vizibil lângă poze, iar creditul stă doar în src/lib', () => {
  assert.deepEqual(creditProblems(sourceFiles), []);
});

test('credit (negativ): figcaption, „Foto:”, „©” lângă poză și creditText în pagini pică', () => {
  const photo = '<ActionPhoto id="M01" sizes="x" />';
  assert.equal(creditProblems([page('src/pages/a.astro', `<figure>${photo}<figcaption>x</figcaption></figure>`)]).length, 1);
  assert.equal(creditProblems([page('src/pages/a.astro', `${photo}<p>Foto: MASCOT</p>`)]).length, 1);
  assert.equal(creditProblems([page('src/pages/a.astro', `<p>© MASCOT</p>${photo}`)]).length, 1);
  assert.equal(creditProblems([page('src/pages/a.astro', `${photo}<p>Credit: x</p>`)]).length, 1);
  assert.equal(creditProblems([page('src/pages/a.astro', `---\nconst c = photo.creditText;\n---\n${photo}`)]).length, 1);
  assert.equal(creditProblems([page('src/components/media/ActionPhoto.astro', '---\n---\n<figcaption>x</figcaption>')]).length, 1);
  assert.equal(creditProblems([page('src/pages/a.astro', photo)]).length, 0);
});

// ---------------------------------------------------------------------------------------------------------------
// 5. JSON-LD

function checkImageObject(obj, where) {
  assert.equal(obj['@type'], 'ImageObject', where);
  for (const key of ['@id', 'contentUrl', 'url', 'width', 'height', 'description', 'creditText', 'copyrightNotice', 'creator']) {
    assert.ok(obj[key], `${where}: lipsește ${key}`);
  }
  assert.equal(obj.inLanguage, 'ro', where);
  assert.ok(obj.contentUrl.startsWith(`${SITE.url}/images/actiune/`), `${where}: contentUrl nu e URL absolut`);
  assert.deepEqual(obj.creator['@type'], 'Organization', where);
  assert.ok(obj.creator.name, where);
  assert.ok(!('license' in obj) && !('acquireLicensePage' in obj), `${where}: license/acquireLicensePage`);
}

test('json-ld: imageObject() pentru toate cele 22 e valid, trece prin jsonLd() și JSON.parse', () => {
  for (const p of photos) {
    const obj = imageObject(p.id);
    checkImageObject(obj, p.id);
    assert.deepEqual(JSON.parse(jsonLd(obj)), obj);
    assert.equal(obj.creditText, p.creditText);
    assert.equal(obj.description, p.alt);
    const big = variants[p.id].at(-1);
    assert.equal(obj.contentUrl, `${SITE.url}/images/actiune/${big.file}`);
    assert.equal(obj.width, big.width);
  }
  assert.equal(new Set(photos.map((p) => imageObject(p.id)['@id'])).size, photos.length);
  assert.equal(imageObjects(['M01', 'P04']).length, 2);
});

test('json-ld: nodul unei pagini referă ImageObject-ul după @id (exemplu pentru taskurile următoare)', () => {
  const ids = ['M02', 'M04'];
  const graph = imageGraph(ids);
  assert.equal(graph['@context'], 'https://schema.org');
  assert.deepEqual(graph['@graph'].map((n) => n['@id']), ids.map((id) => imageRef(id)['@id']));
  const webPage = {
    '@type': 'WebPage',
    '@id': `${SITE.url}/industrii/constructii/#webpage`,
    primaryImageOfPage: imageRef('M02'),
    image: ids.map(imageRef),
  };
  const page = JSON.parse(jsonLd({ '@context': 'https://schema.org', '@graph': [webPage, ...imageObjects(ids)] }));
  const nodeIds = new Set(page['@graph'].map((n) => n['@id']));
  assert.ok(nodeIds.has(page['@graph'][0].primaryImageOfPage['@id']));
  for (const ref of page['@graph'][0].image) assert.ok(nodeIds.has(ref['@id']));
});

const DIST = join(ROOT, 'dist');
test('json-ld: în dist/ toate ImageObject-urile de acțiune au creditul și fără license', (t) => {
  if (!existsSync(DIST) || !statSync(DIST).isDirectory()) {
    t.skip('dist/ lipsește: rulează `npm run build` și apoi testul din nou');
    return;
  }
  const htmlFiles = walk(DIST, (n) => n.endsWith('.html'));
  let checked = 0;
  const visit = (node, where) => {
    if (Array.isArray(node)) return node.forEach((n) => visit(n, where));
    if (!node || typeof node !== 'object') return;
    const type = node['@type'];
    const isImage = type === 'ImageObject' || (Array.isArray(type) && type.includes('ImageObject'));
    if (isImage && typeof node['@id'] === 'string' && node['@id'].includes('#imagine-actiune-')) {
      checkImageObject(node, `${where} ${node['@id']}`);
      checked += 1;
    }
    Object.values(node).forEach((v) => visit(v, where));
  };
  for (const file of htmlFiles) {
    const html = readFileSync(file, 'utf8');
    for (const m of html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
      let parsed;
      assert.doesNotThrow(() => (parsed = JSON.parse(m[1])), `${relative(ROOT, file)}: JSON-LD invalid`);
      visit(parsed, relative(ROOT, file));
    }
  }
  t.diagnostic(`${checked} ImageObject-uri de acțiune verificate în ${htmlFiles.length} pagini`);
});
