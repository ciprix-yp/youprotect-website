// Pozele cu oameni în acțiune (src/data/poze-actiune*.json, public/images/actiune/): integritatea datelor și regulile
// de utilizare, verificate automat prin scanarea sursei ȘI a paginilor generate din dist/. Regulile owner-ului (22.11.2026):
//   1. Portwest (P*) doar lângă produse Portwest: /produse/portwest/, paginile de categorie (/produse/<slug>/) cu cel puțin
//      un produs publicat Portwest și paginile a căror sursă nominalizează (`product: '<slug>'`) un produs publicat Portwest,
//      azi /industrii/logistica/ (licența: „solely for the marketing, promotion, sale and distribution of Portwest products”).
//   2. Fără credit vizibil sub poze; creditul stă doar în ImageObject (creditText, copyrightNotice, creator), fără license.
//   3. O poză apare pe cel mult 2 pagini, niciodată de 2 ori pe aceeași pagină, niciodată ca erou pe 2 pagini.
//
// Analiza sursei e FAIL-CLOSED: orice literal `[MPS]NN` între ghilimele (simple, duble, backtick) din src/ e o referință
// la pagina fișierului; orice formă care nu se poate atribui cu certitudine unei pagini e problemă (pică testul).
// TIPARUL de referință (același text e în src/components/media/ActionPhoto.astro):
//   - src/pages/**/*.astro (fără rute dinamice): <ActionPhoto id="M02" … />, `heroPhoto="M02"` (erou), `photo="S12"` pe
//     <GuideLayout>; acolade cu literal (`heroPhoto={"M02"}`) și `imageGraph([...])` cu literale sunt tot referințe.
//   - erou: `heroPhoto` sau <ActionPhoto priority />; doar pozele cu `erou: true` în date.
//   - catalog: pagina vine din date (CATEGORY_PAGES, BRAND_PAGES: `photo`/`heroPhoto` → /produse/<slug>/); în fișierele
//     catalog-*.ts forma e `photo: 'ID'` literal, iar id-urile din text trebuie să fie exact cele din date.
//   - id/photo/heroPhoto cu expresie dinamică doar în fișierele din DYNAMIC_OK și doar cu `page.photo`, `photo`, `heroPhoto`.
//   - calea /images/actiune/, ACTION_PHOTOS, slug-urile pozelor și photoSrc/imageObject/imageGraph cu argument non-literal
//     sunt interzise în afara src/lib/poze-actiune.ts, ActionPhoto.astro și fișierelor din DYNAMIC_OK (cu variabilele de mai sus).
//   - în dist/: fiecare pagină HTML se analizează după fișierele /images/actiune/*.webp pe care le conține (img, srcset,
//     style, source, JSON-LD), cu aceleași reguli. Asta prinde orice ocolire din sursă.
//   - secțiunea 8 (ocolirile din afara codului): în src/ css/md/mdx/json cu /images/actiune/ sau slug de poză, în dist/ css/js
//     cu /images/actiune/ și, în public/, orice fișier din afara images/actiune/ cu aceiași octeți (SHA-256) ca o variantă.
//   - literalii `[MPS]NN` care nu sunt poze se scriu altfel (`S-10`) sau intră în NOT_PHOTO_IDS (valori care nu sunt id-uri de poză).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACTION_PHOTOS, BODY_PHONE_HIDPI, PHONE_FULL_WIDTH, bodySizes, imageObject, imageObjects, imageGraph, imageRef, photoSrcset, photoSrc, photoSize, photoVariants, heroSrc, heroSrcset, portraitSrcset as photoPortraitSrcset, heroSize, heroVariants, heroStyle, heroPreload, getPhoto } from '../src/lib/poze-actiune.ts';
import { HERO_GRADIENTS } from '../src/lib/erou.ts';
import { jsonLd } from '../src/lib/json-ld.ts';
import { SITE } from '../src/lib/site.ts';
import { CATEGORY_PAGES } from '../src/lib/catalog-categories.ts';
import { BRAND_PAGES } from '../src/lib/catalog-brands.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const photos = JSON.parse(read('src/data/poze-actiune.json'));
const variants = JSON.parse(read('src/data/poze-actiune-variante.json'));

// ---------------------------------------------------------------------------------------------------------------
// 1. Integritatea datelor

const EXPECTED_IDS = [
  'M01', 'M02', 'M04', 'M05', 'M09', 'M10', 'M12', 'M19', 'M20', 'M21', 'M22', 'M23', 'M24', 'M25', 'M26', 'M27',
  'P04', 'P05', 'P06', 'P11', 'P14', 'P15', 'P16',
  'S01', 'S02', 'S04', 'S06', 'S08', 'S12', 'S16', 'S17', 'S18', 'S19',
];
/** Eroul rotativ al homepage-ului: ordinea din `heroPhotos` (src/pages/index.astro); S02 (indexul 0) e și poza fără JavaScript. */
const HERO_SET = ['S02', 'M24', 'M25', 'M26', 'M27', 'P14', 'P15', 'P16', 'S18', 'S19'];
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

test('poze: exact id-urile așteptate (EXPECTED_IDS), fără dubluri, și variante pentru fiecare', () => {
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
// 2. Reguli de utilizare: analiza surselor (fail-closed)

/**
 * Fișierele unde id-ul poate fi dinamic, dar doar cu `page.photo`, `photo` sau `heroPhoto` (variabile primite din
 * pagină sau din catalog): BrandLanding/CategoryLanding (din catalog), GuideLayout (`photo="…"` pus pe pagină),
 * PageHeader, GlobalInnerHero și InnerPageLayout (`heroPhoto="…"` pus pe pagină, doar trecut mai departe).
 */
const DYNAMIC_OK = new Set([
  'src/components/products/BrandLanding.astro',
  'src/components/products/CategoryLanding.astro',
  'src/components/guides/GuideLayout.astro',
  'src/components/global/PageHeader.astro',
  'src/components/global/GlobalInnerHero.astro',
  'src/layouts/InnerPageLayout.astro',
  'src/pages/index.astro', // `const heroPhotos = ["S02", …]` (literale, numărate ca setul eroului) citit de HeroPhotoSet, heroPreload și imageGraph
  'src/components/home/HeroPhotoBlock.astro', // `const heroPhoto = Astro.props.id`: poza unui <template> sau <noscript> din HeroPhotoSet
]);
const ALLOWED_EXPR = /^(?:page\.photo|photo|heroPhoto)$/;
/** Fișierele care definesc sau documentează pozele: nu sunt „utilizări”. */
const NOT_USAGE = new Set(['src/components/media/ActionPhoto.astro', 'src/lib/poze-actiune.ts']);
const CATALOG_FILES = new Set(['src/lib/catalog-brands.ts', 'src/lib/catalog-categories.ts']);
const PHOTO_CALLS = ['photoSrc', 'photoSrcset', 'photoSize', 'heroSrc', 'heroSrcset', 'heroSize', 'heroStyle', 'heroPreload', 'imageObject', 'imageObjects', 'imageGraph', 'imageRef', 'getPhoto'];
const MAX_PAGES_PER_PHOTO = 2;
/**
 * Excepțiile regulii fail-closed: valori de forma `[MPS]NN` care apar între ghilimele în sursă, dar NU sunt id-uri de
 * poză (ex. un cod de produs). Goală acum. Preferă să scrii valoarea altfel (`'S-10'`); adaugă aici doar dacă nu se
 * poate. Un id de poză real nu poate fi exceptat (testul „NOT_PHOTO_IDS” pică).
 */
export const NOT_PHOTO_IDS = new Set([]);
/** Mesajul comun al regulii fail-closed pe literali `[MPS]NN`. */
const NOT_PHOTO_HINT = 'dacă nu e id de poză, scrie valoarea altfel (ex. `S-10`) sau adaugă excepția în NOT_PHOTO_IDS';

const toPosix = (p) => p.split(sep).join('/');

/** src/pages/a/b.astro -> /a/b/ ; index.astro -> /a/ ; null pentru rute dinamice. */
export function routeOf(path) {
  const m = /^src\/pages\/(.+)\.astro$/.exec(path);
  if (!m) return undefined;
  if (m[1].includes('[')) return null;
  const clean = m[1].replace(/(^|\/)index$/, '');
  return clean === '' ? '/' : `/${clean}/`;
}

/** Argumentele unui apel, între paranteza deschisă de la `open` și perechea ei. */
function callArgs(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    const c = text[i];
    if (c === '(' || c === '[' || c === '{') depth += 1;
    else if (c === ')' || c === ']' || c === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(open + 1, i);
    }
  }
  return text.slice(open + 1);
}

const Q = '["\'`]';
const LITERAL_ARGS = new RegExp(`^\\[?(?:${Q}[MPS][0-9]{2}${Q},?)*\\]?(?:,[0-9]+)?$`);
// În DYNAMIC_OK: elemente = variabila așteptată sau literal (ex. imageGraph(["M12", heroPhoto])), nu orice expresie.
const DYN_ITEM = `(?:page\\.photo|photo|heroPhoto|heroPhotos|\\.\\.\\.heroPhotos|${Q}[MPS][0-9]{2}${Q})`;
const DYNAMIC_ARGS = new RegExp(`^\\[?${DYN_ITEM}(?:,${DYN_ITEM})*\\]?(?:,[0-9]+)?$`);

/** Paginile din date: { slug, photo?, heroPhoto? } -> referințe la /produse/<slug>/. */
export function catalogRefs(pages) {
  const refs = [];
  for (const p of pages) {
    if (p.photo) refs.push({ id: p.photo, page: `/produse/${p.slug}/`, hero: false, render: true, file: `catalog:${p.slug}` });
    if (p.heroPhoto) refs.push({ id: p.heroPhoto, page: `/produse/${p.slug}/`, hero: true, render: true, file: `catalog:${p.slug}` });
  }
  return refs;
}

/**
 * Referințele la poze dintr-o listă de surse [{ path, text }]. `catalog` = paginile din date (vezi catalogRefs).
 * Întoarce { refs: [{ id, page, hero, render, file }], problems: string[] }. `render` = poza e afișată de pagină
 * (id/photo/heroPhoto); altfel e doar menționată (imageGraph, photoSrc, un literal oarecare) și nu intră la „de două ori”.
 */
export function analyzeUsage(files, { catalog = [], slugs = photos.map((p) => p.slug), notPhotoIds = NOT_PHOTO_IDS } = {}) {
  const refs = catalogRefs(catalog);
  const problems = [];
  for (const { path, text } of files) {
    if (NOT_USAGE.has(path)) continue;
    const dynOk = DYNAMIC_OK.has(path);
    const isCatalog = CATALOG_FILES.has(path);
    const bad = (msg) => problems.push(`${path}: ${msg}`);
    const consumed = []; // [start, end) deja atribuite
    const found = []; // { id, hero, render }
    const isConsumed = (i) => consumed.some(([a, b]) => i >= a && i < b);

    // 1. <ActionPhoto id=…>
    for (const tag of text.matchAll(/<ActionPhoto\b((?:[^>{}]|\{[^{}]*\})*)>/g)) {
      const attrs = tag[1];
      const base = tag.index + '<ActionPhoto'.length;
      const priority = /\bpriority\b(?!\s*=\s*\{\s*false\s*\})/.test(attrs);
      const lit = new RegExp(`\\bid\\s*=\\s*(?:\\{\\s*(${Q})([^"'\`$]*)\\1\\s*\\}|(${Q})([^"'\`$]*)\\3)`).exec(attrs);
      if (lit) {
        found.push({ id: lit[2] ?? lit[4], hero: priority, render: true });
        consumed.push([base + lit.index, base + lit.index + lit[0].length]);
        continue;
      }
      const dyn = /\bid\s*=\s*\{([^{}]*)\}/.exec(attrs);
      if (!dyn) bad('<ActionPhoto> fără id');
      else if (!dynOk) bad(`<ActionPhoto id={${dyn[1].trim()}}> cu id dinamic în afara fișierelor din DYNAMIC_OK`);
      else if (!ALLOWED_EXPR.test(dyn[1].trim())) bad(`<ActionPhoto id={${dyn[1].trim()}}>: în DYNAMIC_OK doar page.photo, photo sau heroPhoto`);
    }

    // 1b. Eroul rotativ al homepage-ului: `const heroPhotos = ["S02", …]` (index.astro). Fiecare id e erou și randat o dată pe
    // pagină (poza apare într-un <template erou-N>, iar prima și în <noscript>, dar în DOM niciodată de două ori); refs au
    // `heroSet: true`, singura formă în care P14-P16 au voie pe „/” (vezi HERO_SET_PORTWEST).
    for (const m of text.matchAll(/(?<![-\w.?$])heroPhotos\s*=\s*\[([^\]]*)\]/g)) {
      if (!path.endsWith('.astro')) continue;
      const items = [...m[1].matchAll(new RegExp(`(${Q})([MPS][0-9]{2})\\1`, 'g'))];
      const rest = m[1].replace(new RegExp(`(${Q})([MPS][0-9]{2})\\1`, 'g'), '').replace(/[\s,]/g, '');
      if (rest) bad('heroPhotos: doar literale „ID” (fără expresii)');
      for (const it of items) found.push({ id: it[2], hero: true, render: true, heroSet: true });
      consumed.push([m.index, m.index + m[0].length]);
    }

    // 2. photo / heroPhoto ca atribut (=) sau cheie (:)
    for (const m of text.matchAll(/(?<![-\w.?$])(photo|heroPhoto)\s*([=:])\s*/g)) {
      const rest = text.slice(m.index + m[0].length);
      const lit = new RegExp(`^(?:\\{\\s*(${Q})([^"'\`$]*)\\1\\s*\\}|(${Q})([^"'\`$]*)\\3)`).exec(rest);
      if (lit) {
        found.push({ id: lit[2] ?? lit[4], hero: m[1] === 'heroPhoto', render: true });
        consumed.push([m.index, m.index + m[0].length + lit[0].length]);
        continue;
      }
      const exprRaw = m[2] === '=' ? /^\{([^{}]*)\}/.exec(rest)?.[1] : /^([^,\n}]*)/.exec(rest)?.[1];
      const expr = (exprRaw ?? '').trim().replace(/;$/, '');
      if (m[2] === ':' && /^string(?:\s*\|\s*undefined)?$/.test(expr)) continue; // anotare de tip
      // `=` e atribut doar în .astro; `const photo = …` / `var photo = …` e o variabilă locală (valorile ei literale se numără oricum)
      if (m[2] === '=' && (!path.endsWith('.astro') || /\b(?:const|let|var)\s+$/.test(text.slice(0, m.index)))) continue;
      if (!dynOk) bad(`${m[1]}${m[2]}${expr ? ` „${expr}”` : ''}: valoare care nu e literal, nu se poate atribui unei pagini`);
      else if (!ALLOWED_EXPR.test(expr)) bad(`${m[1]}${m[2]} „${expr}”: în DYNAMIC_OK doar page.photo, photo sau heroPhoto`);
    }

    // 3. orice alt literal [MPS]NN este o referință (fără randare)
    for (const m of text.matchAll(new RegExp(`(${Q})([MPS][0-9]{2})\\1`, 'g'))) {
      if (isConsumed(m.index) || notPhotoIds.has(m[2])) continue;
      if (isCatalog) {
        if (!/(?<![-\w.?$])(?:photo|heroPhoto)\s*:\s*$/.test(text.slice(Math.max(0, m.index - 40), m.index)) || m[1] === '`') {
          bad(`„${m[2]}” în catalog doar ca \`photo: 'ID'\` sau \`heroPhoto: 'ID'\`; ${NOT_PHOTO_HINT}`);
        }
        continue;
      }
      found.push({ id: m[2], hero: false, render: false });
    }
    if (isCatalog) {
      for (const m of text.matchAll(/(?<![-\w.?$])(photo|heroPhoto)\s*:\s*(?!string\b)(\S[^\n]*)/g)) {
        if (!/^(["'])[MPS][0-9]{2}\1/.test(m[2])) bad(`${m[1]}: ${m[2].trim()}: în catalog doar literal 'ID' (fără template sau expresie)`);
      }
    }

    // 4. apeluri către helperii de poze: argumentul trebuie să fie literal (sau variabila așteptată în DYNAMIC_OK)
    for (const m of text.matchAll(new RegExp(`(?<![\\w.])(${PHOTO_CALLS.join('|')})\\s*\\(`, 'g'))) {
      const args = callArgs(text, m.index + m[0].length - 1).replace(/\s+/g, '');
      if (LITERAL_ARGS.test(args)) continue;
      if (dynOk && DYNAMIC_ARGS.test(args)) continue;
      bad(`${m[1]}(${args}) cu argument care nu e literal`);
    }

    // 5. ocolirea registrului: calea fișierelor, slug-urile, datele și lista completă
    if (/images\/actiune/.test(text)) bad('calea /images/actiune/ în sursă (poza se cere doar prin id)');
    for (const s of slugs) if (text.includes(s)) bad(`slug-ul pozei „${s}” în sursă (poza se cere doar prin id)`);
    if (/(?:from|import)\s*\(?\s*["'][^"']*data\/poze-actiune/.test(text)) bad('importă direct src/data/poze-actiune*');
    if (/\bACTION_PHOTOS\b/.test(text)) bad('ACTION_PHOTOS în afara src/lib/poze-actiune.ts');

    // 6. atribuirea la pagină (catalogul vine din date)
    if (isCatalog || found.length === 0) continue;
    const page = routeOf(path);
    if (!page) {
      bad(`poze („${found.map((f) => f.id).join('”, „')}”) într-un fișier din care nu se deduce pagina; ${NOT_PHOTO_HINT}`);
      continue;
    }
    for (const f of found) refs.push({ ...f, page, file: path });
  }
  return { refs, problems };
}

/** Încalcă regula 3 (pagini, dubluri, erou) și id-urile necunoscute? Întoarce lista de probleme. */
export function usageProblems(refs, photoData) {
  const problems = [];
  const known = new Map(photoData.map((p) => [p.id, p]));
  for (const r of refs) {
    if (!known.has(r.id)) problems.push(`${r.file}: id necunoscut „${r.id}”`);
    else if (r.hero && !known.get(r.id).erou) problems.push(`${r.file}: „${r.id}” nu are voie ca erou (erou: false)`);
  }
  const byId = Map.groupBy(refs, (r) => r.id);
  for (const [id, list] of byId) {
    const pages = new Set(list.map((r) => r.page));
    const rendered = list.filter((r) => r.render).map((r) => r.page);
    for (const page of new Set(rendered)) {
      if (rendered.filter((p) => p === page).length > 1) problems.push(`${id}: de două ori pe ${page}`);
    }
    if (pages.size > MAX_PAGES_PER_PHOTO) {
      problems.push(`${id}: pe ${pages.size} pagini (max. ${MAX_PAGES_PER_PHOTO}): ${[...pages].join(', ')}`);
    }
    const heroPages = new Set(list.filter((r) => r.hero).map((r) => r.page));
    if (heroPages.size > 1) problems.push(`${id}: erou pe ${heroPages.size} pagini: ${[...heroPages].join(', ')}`);
  }
  return problems;
}

/**
 * Excepția Portwest, decisă de Ciprian pe 26.11.2026: setul rotativ al eroului homepage-ului include 3 poze Portwest. Strictă:
 * doar pagina „/”, doar aceste ID-uri și doar ca parte din set (`heroSet`: în sursă, lista `heroPhotos`; în dist, doar în
 * <template>-urile eroului și în JSON-LD). Orice alt P* în afara paginilor Portwest, și P14-P16 oriunde altundeva sau în alt
 * loc pe „/”, pică ca înainte.
 */
export const HERO_SET_PORTWEST = { page: '/', ids: new Set(['P14', 'P15', 'P16']) };
const isHeroSetException = (r) => r.heroSet === true && r.page === HERO_SET_PORTWEST.page && HERO_SET_PORTWEST.ids.has(r.id);

/** Regula Portwest: P* doar pe paginile permise (set de rute), plus excepția setului eroului (HERO_SET_PORTWEST). */
export function portwestProblems(refs, allowedPages) {
  return refs
    .filter((r) => r.id.startsWith('P') && !allowedPages.has(r.page) && !isHeroSetException(r))
    .map((r) => `${r.file}: ${r.id} (Portwest) pe ${r.page}, unde nu e pagină cu produse Portwest`);
}

/** Scoate blocurile <style>…</style> (global, tolerant la `</style >`) până la punct fix, ca să nu rămână niciun `<style`. */
function stripStyleBlocks(text) {
  let prev;
  let out = text;
  do {
    prev = out;
    out = out.replace(/<style\b[\s\S]*?<\/style\s*>/gi, '');
  } while (out !== prev);
  return out;
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
      const markup = stripStyleBlocks(text.replace(/^---[\s\S]*?\n---/, ''));
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

const products = readdirSync(join(ROOT, 'src/content/products'))
  .filter((n) => n.endsWith('.json'))
  .map((n) => ({ id: n.replace(/\.json$/, ''), ...JSON.parse(readFileSync(join(ROOT, 'src/content/products', n), 'utf8')) }))
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
const CATALOG = [...CATEGORY_PAGES, ...BRAND_PAGES];
const REAL = { catalog: CATALOG };

test('utilizare: sursa actuală respectă regulile (max. 2 pagini, fără dubluri, erou unic, id-uri valide, nimic neatribuit)', () => {
  const { refs, problems } = analyzeUsage(sourceFiles, REAL);
  assert.deepEqual(problems, []);
  assert.deepEqual(usageProblems(refs, PHOTOS), []);
  assert.ok(refs.length >= photos.length, 'prea puține referințe: analiza nu vede utilizările');
});

test('catalog: id-urile din catalog-*.ts sunt exact cele din date (CATEGORY_PAGES, BRAND_PAGES)', () => {
  const fromText = sourceFiles
    .filter((f) => CATALOG_FILES.has(f.path))
    .flatMap((f) => [...f.text.matchAll(/(?<![-\w.?$])(?:photo|heroPhoto)\s*:\s*'([MPS][0-9]{2})'/g)].map((m) => m[1]))
    .sort();
  const fromData = CATALOG.flatMap((p) => [p.photo, p.heroPhoto].filter(Boolean)).sort();
  assert.deepEqual(fromText, fromData);
});

const page = (path, body) => ({ path, text: body });
const SYN = (files, opts) => {
  const { refs, problems } = analyzeUsage(files, opts);
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
  // id dinamic în pagină sau în DYNAMIC_OK cu altă expresie; id literal într-o componentă sau rută dinamică
  assert.match(SYN([page('src/pages/a.astro', '<ActionPhoto id={x} sizes="y" />')]).join('\n'), /id dinamic în afara/);
  assert.match(SYN([page('src/components/products/BrandLanding.astro', '<ActionPhoto id={x.photo} sizes="y" />')]).join('\n'), /doar page\.photo/);
  assert.match(SYN([page('src/components/global/Footer.astro', '<ActionPhoto id="M01" sizes="y" />')]).join('\n'), /nu se deduce pagina/);
  assert.match(SYN([page('src/pages/produse/[slug].astro', '<ActionPhoto id="M01" sizes="y" />')]).join('\n'), /nu se deduce pagina/);
  // aceeași poză ca render + mențiune în JSON-LD pe aceeași pagină NU e „de două ori”
  assert.deepEqual(
    SYN([page('src/pages/a.astro', `<PageHeader heroPhoto="M02" />\n<script set:html={jsonLd(imageGraph(['M02']))} />`)]),
    [],
  );
});

test('utilizare (negativ): ocolirile din reviewer (a)-(e) pică', () => {
  const free = CATEGORY_PAGES.find((c) => !portwestCategorySlugs(products).includes(c.slug)).slug;
  const allowed = portwestAllowedPages(products, sourceFiles);
  const all = (files, opts = {}) => {
    const { refs, problems } = analyzeUsage(files, opts);
    return [...problems, ...usageProblems(refs, PHOTOS), ...portwestProblems(refs, allowed)];
  };
  // (a) acolade cu literal, pe ghid / pagină de industrie / eroul unei pagini
  assert.ok(all([page('src/pages/index.astro', '<PageHeader heroPhoto={"P04"} />')]).length > 0);
  assert.ok(all([page('src/pages/ghiduri/x.astro', '<InnerPageLayout heroPhoto={"P04"}>')]).length > 0);
  assert.ok(all([page('src/pages/ghiduri/x.astro', '<GuideLayout photo={"P05"}>')]).length > 0);
  assert.ok(all([page('src/pages/ghiduri/x.astro', '<GuideLayout\n photo =\n "P05">')]).length > 0);
  assert.ok(all([page('src/pages/ghiduri/x.astro', "<GuideLayout photo={'P05'}>")]).length > 0);
  // ... și pe pagini unde poza non-Portwest e în regulă, Portwest pică; M* trece
  assert.equal(all([page('src/pages/ghiduri/x.astro', '<GuideLayout photo={"M01"}>')]).length, 0);
  // (b) cale directă, photoSrc, doar imageGraph
  assert.match(all([page('src/pages/index.astro', '<InnerPageLayout heroImage="/images/actiune/x-portwest-1440.webp" />')]).join('\n'), /images\/actiune/);
  assert.match(all([page('src/pages/index.astro', '<img src="/images/actiune/muncitor-trage-transpalet-vesta-reflectorizanta-portwest-960.webp" />')]).join('\n'), /images\/actiune/);
  assert.match(all([page('src/pages/index.astro', '<img src={photoSrc(x)} />')]).join('\n'), /photoSrc\(x\) cu argument care nu e literal/);
  assert.match(all([page('src/pages/index.astro', '<img src={photoSrc(`P${n}`)} />')]).join('\n'), /nu e literal/);
  assert.ok(all([page('src/pages/industrii/constructii.astro', "<img src={photoSrc('P04')} />")]).some((p) => /Portwest/.test(p)));
  assert.ok(all([page('src/pages/industrii/constructii.astro', "set:html={jsonLd(imageGraph(['P04']))}")]).some((p) => /Portwest/.test(p)));
  assert.ok(all([page('src/pages/industrii/constructii.astro', "set:html={jsonLd(imageObject(\"P04\"))}")]).some((p) => /Portwest/.test(p)));
  assert.match(all([page('src/pages/a.astro', 'set:html={jsonLd(imageGraph(ids))}')]).join('\n'), /nu e literal/);
  assert.match(all([page('src/lib/x.ts', "const s = 'muncitor-trage-transpalet-vesta-reflectorizanta-portwest';")]).join('\n'), /slug-ul pozei/);
  assert.match(all([page('src/pages/a.astro', "import photos from '../data/poze-actiune.json';")]).join('\n'), /src\/data\/poze-actiune/);
  assert.match(all([page('src/pages/a.astro', 'ACTION_PHOTOS.map(x)')]).join('\n'), /ACTION_PHOTOS/);
  // (c) template literal, în pagină și în catalog
  assert.ok(all([page('src/pages/ghiduri/x.astro', '<GuideLayout photo={`P05`}>')]).some((p) => /Portwest/.test(p)));
  assert.match(all([page('src/lib/catalog-brands.ts', '{ slug: \'mascot\', photo: `P04` }')]).join('\n'), /catalog/);
  assert.match(all([page('src/lib/catalog-brands.ts', "{ slug: 'mascot', photo: pick('P04') }")]).join('\n'), /catalog/);
  assert.match(all([page('src/lib/catalog-brands.ts', "{ slug: 'mascot', photo: x }")]).join('\n'), /catalog/);
  assert.match(all([page('src/lib/catalog-brands.ts', "const x = 'P04';")]).join('\n'), /catalog/);
  assert.equal(all([page('src/lib/catalog-brands.ts', "{ slug: 'mascot', photo: 'M04' }")]).length, 0);
  // (d) id literal sau dinamic în fișierele din DYNAMIC_OK
  for (const file of DYNAMIC_OK) {
    assert.ok(all([page(file, '<ActionPhoto id={"P04"} sizes="x" />')]).length > 0, file);
    assert.ok(all([page(file, '<ActionPhoto id="P04" sizes="x" />')]).length > 0, file);
    assert.ok(all([page(file, '<ActionPhoto id={other} sizes="x" />')]).length > 0, file);
    assert.ok(all([page(file, '<ActionPhoto id={page.photo ?? "P04"} sizes="x" />')]).length > 0, file);
    assert.equal(all([page(file, '<ActionPhoto id={photo} sizes="x" />')]).filter((p) => /ActionPhoto/.test(p)).length, 0, file);
  }
  // (e) catalogul vine din date: `photo` înaintea lui `slug` nu mai contează, pagina e cea din date
  const viaData = (pagesData) => all([], { catalog: pagesData });
  assert.ok(viaData([{ key: 'x', photo: 'P04', slug: free }]).some((p) => new RegExp(`/produse/${free}/`).test(p)));
  assert.ok(viaData([{ slug: 'mascot', photo: 'P06' }]).some((p) => /Portwest/.test(p)));
  assert.equal(viaData([{ slug: 'portwest', photo: 'P04' }]).length, 0);
  assert.ok(viaData([{ slug: 'mascot', heroPhoto: 'S12', photo: 'S12' }]).some((p) => /de două ori|nu are voie ca erou/.test(p)));
});

test('utilizare (pozitiv): tiparele valide se rezolvă pe pagina corectă', () => {
  const brands = `export const BRAND_PAGES = [
    { brand: 'MASCOT®', slug: 'mascot', heroPhoto: 'M02', photo: 'M04' },
    { brand: 'Portwest', slug: 'portwest', photo: 'P04' },
  ];`;
  const catalog = [
    { slug: 'mascot', heroPhoto: 'M02', photo: 'M04' },
    { slug: 'portwest', photo: 'P04' },
  ];
  const { refs, problems } = analyzeUsage(
    [
      page('src/lib/catalog-brands.ts', brands),
      page('src/pages/industrii/logistica.astro', '<ActionPhoto id="P05" sizes="x" />'),
      page('src/pages/index.astro', "<ActionPhoto id='S02' sizes=\"x\" />"),
      page('src/pages/ghiduri/g.astro', '<GuideLayout guide={guide} photo="S12">'),
      page('src/components/products/BrandLanding.astro', '<ActionPhoto id={page.photo} sizes="x" />{jsonLd(imageGraph([page.photo]))}'),
      page('src/components/guides/GuideLayout.astro', '<ActionPhoto id={photo} sizes="x" />{photo ? { image: imageObject(photo) } : {}}{photoSize(photo)}'),
      page('src/components/global/PageHeader.astro', '<ActionPhoto id={heroPhoto} sizes="x" priority />\n  heroPhoto?: string;'),
      page('src/layouts/InnerPageLayout.astro', '<PageHeader heroPhoto={heroPhoto} />\n    heroPhoto?: string;'),
      page('src/components/products/ProductCard.astro', '<a data-vt-photo="abc" />'),
    ],
    { catalog },
  );
  assert.deepEqual(problems, []);
  assert.deepEqual(
    refs.map((r) => `${r.id}@${r.page}${r.hero ? ' hero' : ''}`).sort(),
    ['M02@/produse/mascot/ hero', 'M04@/produse/mascot/', 'P04@/produse/portwest/', 'P05@/industrii/logistica/', 'S02@/', 'S12@/ghiduri/g/'].sort(),
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

/** Slug-urile categoriilor cu cel puțin un produs publicat Portwest. */
function portwestCategorySlugs(published) {
  const keys = new Set(published.filter((p) => p.supplier.brand === 'Portwest').map((p) => p.category));
  return CATEGORY_PAGES.filter((c) => keys.has(c.key)).map((c) => c.slug);
}

/** Rutele paginilor al căror text nominalizează (`product: '<slug>'`) un produs publicat Portwest. */
function portwestProductPages(published, files) {
  const slugs = new Set(published.filter((p) => p.supplier.brand === 'Portwest').map((p) => p.id));
  const pages = new Set();
  for (const f of files) {
    const route = routeOf(f.path);
    if (!route) continue;
    for (const m of f.text.matchAll(/\bproduct:\s*(["'])([^"']+)\1/g)) if (slugs.has(m[2])) pages.add(route);
  }
  return pages;
}

/** Paginile unde au voie pozele P*: brandul Portwest, categoriile cu produs Portwest, paginile care nominalizează unul. */
function portwestAllowedPages(published, files) {
  return new Set([
    '/produse/portwest/',
    ...portwestCategorySlugs(published).map((s) => `/produse/${s}/`),
    ...portwestProductPages(published, files),
  ]);
}

const ALLOWED_PAGES = portwestAllowedPages(products, sourceFiles);

test('portwest: pozele P* doar pe paginile permise (sursa actuală)', () => {
  const { refs } = analyzeUsage(sourceFiles, REAL);
  assert.ok(refs.some((r) => r.id.startsWith('P')), 'nicio poză Portwest folosită: testul nu verifică nimic');
  assert.deepEqual(portwestProblems(refs, ALLOWED_PAGES), []);
});

test('portwest: categoriile și paginile permise vin din fișele publicate Portwest', () => {
  const slugs = portwestCategorySlugs(products);
  assert.ok(slugs.length > 0, 'nicio categorie cu produse Portwest');
  for (const s of slugs) assert.ok(CATEGORY_PAGES.some((c) => c.slug === s));
  const withoutPortwest = CATEGORY_PAGES.filter((c) => !slugs.includes(c.slug));
  assert.ok(withoutPortwest.length > 0, 'toate categoriile au Portwest: testul negativ de mai jos nu are pe ce rula');
  // /industrii/logistica/ e permisă doar fiindcă EquipmentList nominalizează produse Portwest publicate (nu e hardcodată)
  assert.ok(
    portwestProductPages(products, sourceFiles).has('/industrii/logistica/'),
    '/industrii/logistica/ nu mai nominalizează niciun produs Portwest publicat: pozele P* de pe ea nu mai au acoperire',
  );
});

test('portwest (negativ): P* pe pagini nepermise pică', () => {
  const slugs = portwestCategorySlugs(products);
  const free = CATEGORY_PAGES.find((c) => !slugs.includes(c.slug)).slug;
  const bad = (path, text, catalog = []) => portwestProblems(analyzeUsage([page(path, text)], { catalog }).refs, ALLOWED_PAGES);
  assert.equal(bad('src/pages/ghiduri/s1p-sau-s3.astro', '<ActionPhoto id="P05" sizes="x" />').length, 1);
  assert.equal(bad('src/pages/industrii/constructii.astro', '<ActionPhoto id="P05" sizes="x" />').length, 1);
  assert.equal(bad('src/pages/index.astro', '<PageHeader heroPhoto="P04" />').length, 1);
  assert.equal(bad('src/lib/x.ts', '', [{ slug: 'mascot', photo: 'P06' }]).length, 1);
  assert.equal(bad('src/lib/x.ts', '', [{ slug: free, photo: 'P11' }]).length, 1);
  // o pagină care nominalizează un produs Portwest devine permisă; fără produs (sau cu produs inexistent) nu
  const fakePages = portwestAllowedPages(products, [
    page('src/pages/industrii/depozite.astro', "{ text: 'x', product: 'geaca-depozit-frigorific-portwest-coldstore-cs10' }"),
    page('src/pages/industrii/altele.astro', "{ text: 'x', product: 'nu-exista' }"),
  ]);
  assert.ok(fakePages.has('/industrii/depozite/'));
  assert.ok(!fakePages.has('/industrii/altele/'));
  // permise
  assert.equal(bad('src/pages/industrii/logistica.astro', '<ActionPhoto id="P05" sizes="x" />').length, 0);
  assert.equal(bad('src/lib/x.ts', '', [{ slug: 'portwest', photo: 'P11' }]).length, 0);
  assert.equal(bad('src/lib/x.ts', '', [{ slug: slugs[0], photo: 'P04' }]).length, 0);
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

test('json-ld: imageObject() pentru toate pozele e valid, trece prin jsonLd() și JSON.parse', () => {
  for (const p of photos) {
    const obj = imageObject(p.id);
    checkImageObject(obj, p.id);
    assert.deepEqual(JSON.parse(jsonLd(obj)), obj);
    assert.equal(obj.creditText, p.creditText);
    assert.equal(obj.description, p.alt);
    const big = variants[p.id].filter((v) => !v.portret).at(-1);
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

// ---------------------------------------------------------------------------------------------------------------
// 6. dist/: regulile pe paginile generate (prinde orice ocolire din sursă)

const DIST = join(ROOT, 'dist');
const REQUIRE_DIST = process.env.POZE_REQUIRE_DIST === '1';
const FILE_TO_ID = new Map(Object.entries(variants).flatMap(([id, list]) => list.map((v) => [v.file, id])));

/** dist/a/b/index.html -> /a/b/ ; dist/index.html -> / ; dist/404.html -> /404/ */
export function routeOfHtml(rel) {
  const clean = toPosix(rel).replace(/\.html$/, '').replace(/(^|\/)index$/, '');
  return clean === '' ? '/' : `/${clean}/`;
}

/**
 * Pozele de acțiune din fiecare pagină HTML din `distDir`, după fișierele /images/actiune/<fișier> pe care le conține
 * (img src/srcset, style, source, link, meta, JSON-LD). O referință pe (id, pagină), deduplicată: aceeași poză în mai
 * multe variante/srcset și în JSON-LD e o singură utilizare. Erou = tag cu `fetchpriority=high`.
 * Întoarce { refs, problems, pages }.
 */
/**
 * Template-urile eroului rotativ (HeroPhotoSet.astro): conținut inert, una din pozele setului în fiecare. EXCEPȚIE documentată:
 * ele (și numai ele) nu se numără la „de două ori pe pagină” și, pentru P14-P16 pe „/”, la regula Portwest; <noscript>-ul eroului
 * (prima poză, doar fără JS) se numără normal, ca un <img> obișnuit. Orice alt <template> sau <img> rămâne analizat ca înainte.
 */
/**
 * Blocurile `<tag …>…</tag>` din HTML, găsite cu indexOf (fără regex, insensibil la majuscule): [{ start, end, open, inner }].
 * Doar pentru EXTRAGERE și numărare în teste (nu curăță HTML); `accept` alege blocurile după eticheta de deschidere.
 */
export function htmlBlocks(html, tag, accept = () => true) {
  const lower = html.toLowerCase();
  const blocks = [];
  let from = 0;
  for (;;) {
    const start = lower.indexOf(`<${tag}`, from);
    if (start < 0) break;
    const after = lower[start + tag.length + 1];
    if (!['>', ' ', '\n', '\t', '\r', '/'].includes(after)) {
      from = start + 1; // alt tag cu același prefix (ex. <scripts>)
      continue;
    }
    const openEnd = lower.indexOf('>', start);
    if (openEnd > 0 && lower[openEnd - 1] === '/') {
      // etichetă auto-închisă (în .astro: `<script … set:html={…} />`): bloc fără conținut
      const selfClosed = { start, end: openEnd + 1, open: html.slice(start, openEnd + 1), inner: '' };
      if (accept(selfClosed)) blocks.push(selfClosed);
      from = openEnd + 1;
      continue;
    }
    const closeStart = openEnd < 0 ? -1 : lower.indexOf(`</${tag}`, openEnd);
    const closeEnd = closeStart < 0 ? -1 : lower.indexOf('>', closeStart);
    if (closeEnd < 0) break;
    const block = { start, end: closeEnd + 1, open: html.slice(start, openEnd + 1), inner: html.slice(openEnd + 1, closeStart) };
    if (accept(block)) blocks.push(block);
    from = closeEnd + 1;
  }
  return blocks;
}
/** Textul HTML fără blocurile date (rezultat al lui htmlBlocks pe același text). */
export function withoutBlocks(html, blocks) {
  let out = '';
  let pos = 0;
  for (const b of blocks) {
    out += html.slice(pos, b.start);
    pos = b.end;
  }
  return out + html.slice(pos);
}
const isHeroTemplate = (b) => /\sid="erou-\d+"/.test(b.open);
const isLdScript = (b) => /\stype="application\/ld\+json"/.test(b.open);
const heroTemplateBlocks = (html) => htmlBlocks(html, 'template', isHeroTemplate);
const ldScriptBlocks = (html) => htmlBlocks(html, 'script', isLdScript);

export function analyzeDist(distDir, fileToId = FILE_TO_ID) {
  const refs = [];
  const problems = [];
  const htmlFiles = walk(distDir, (n) => n.endsWith('.html'));
  for (const file of htmlFiles) {
    const rel = toPosix(relative(distDir, file));
    const route = routeOfHtml(rel);
    const html = readFileSync(file, 'utf8');
    const names = new Set([...html.matchAll(/images\\?\/actiune\\?\/([A-Za-z0-9._-]+)/g)].map((m) => m[1].replace(/\.+$/, '')));
    if (names.size === 0) continue;
    const hero = new Set();
    const imgCount = new Map();
    const ids = new Set();
    // în afara template-urilor eroului (excepția de mai sus): <img> numărate la „de două ori” și poze care nu sunt doar în JSON-LD
    // Excepția e doar pentru „/” (HERO_SET_PORTWEST.page): pe orice altă pagină un <template id="erou-N"> se numără ca tot restul.
    const onHome = route === HERO_SET_PORTWEST.page;
    const outside = onHome ? withoutBlocks(html, heroTemplateBlocks(html)) : html;
    const strayIds = new Set(
      [...withoutBlocks(outside, ldScriptBlocks(outside)).matchAll(/images\\?\/actiune\\?\/([A-Za-z0-9._-]+)/g)].map((m) => fileToId.get(m[1].replace(/\.+$/, ''))).filter(Boolean),
    );
    for (const name of names) {
      const id = fileToId.get(name);
      if (!id) problems.push(`${rel}: fișier de poză de acțiune necunoscut „${name}” (nu e în poze-actiune-variante.json)`);
      else ids.add(id);
      if (!existsSync(join(distDir, 'images/actiune', name))) problems.push(`${rel}: „${name}” nu există în dist/images/actiune/`);
    }
    for (const [source, counted] of [[html, false], [outside, true]]) {
      for (const tag of source.matchAll(/<(img|link|source)\b[^>]*>/gi)) {
        if (!/images\\?\/actiune\\?\//.test(tag[0])) continue;
        const tagIds = new Set(
          [...tag[0].matchAll(/images\\?\/actiune\\?\/([A-Za-z0-9._-]+)/g)].map((m) => fileToId.get(m[1].replace(/\.+$/, ''))).filter(Boolean),
        );
        for (const id of tagIds) {
          if (!counted && /fetchpriority\s*=\s*["']?high/i.test(tag[0])) hero.add(id);
          if (counted && tag[1].toLowerCase() === 'img') imgCount.set(id, (imgCount.get(id) ?? 0) + 1);
        }
      }
    }
    for (const [id, n] of imgCount) if (n > 1) problems.push(`${id}: de două ori pe ${route} (${n} elemente <img>)`);
    for (const id of ids) refs.push({ id, page: route, hero: hero.has(id), render: true, file: rel, heroSet: onHome && !strayIds.has(id) });
  }
  return { refs, problems, pages: htmlFiles.length };
}

const distProblems = ({ refs, problems }) => [
  ...problems,
  ...usageProblems(refs, PHOTOS),
  ...portwestProblems(refs, ALLOWED_PAGES),
];

/** Ce face testul din dist: `ok` (dist/ există), `fail` (lipsește și POZE_REQUIRE_DIST=1) sau `skip`. */
export function distGate(distExists, requireDist) {
  if (distExists) return 'ok';
  return requireDist ? 'fail' : 'skip';
}
const DIST_MISSING = 'dist/ lipsește: rulează `npm run build` și apoi testul din nou';

/** true dacă dist/ există; altfel pică (POZE_REQUIRE_DIST=1, în CI după build) sau sare cu mesaj clar. */
function distAvailable(t) {
  const gate = distGate(existsSync(DIST) && statSync(DIST).isDirectory(), REQUIRE_DIST);
  if (gate === 'fail') assert.fail(`POZE_REQUIRE_DIST=1, dar ${DIST_MISSING}`);
  if (gate === 'skip') t.skip(DIST_MISSING);
  return gate === 'ok';
}

test('dist: pozele de acțiune din paginile generate respectă regulile (Portwest, 2 pagini, erou, fișiere existente)', (t) => {
  if (!distAvailable(t)) return;
  const result = analyzeDist(DIST);
  assert.deepEqual(distProblems(result), []);
  assert.ok(result.refs.length > 0, 'nicio poză de acțiune găsită în dist/: analiza nu vede nimic');
  t.diagnostic(`${result.refs.length} utilizări de poze în ${result.pages} pagini`);
});

test('dist: în dist/ toate ImageObject-urile de acțiune au creditul și fără license', (t) => {
  if (!distAvailable(t)) return;
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

// ---------------------------------------------------------------------------------------------------------------
// Eroul rotativ al homepage-ului pe dist/index.html: template-uri, noscript, scripturile inline, JSON-LD, CSS-ul gradientelor

/** Scripturile inline (fără src, fără JSON-LD) din HTML: [{ code }] */
const inlineScripts = (html) => htmlBlocks(html, 'script', (b) => !/\s(?:src|type)=/.test(b.open)).map((b) => b.inner);
const ATTR = { srcset: /\ssrcset="([^"]*)"/, sizes: /\ssizes="([^"]*)"/, media: /\smedia="([^"]*)"/, alt: /\salt="([^"]*)"/ };
const attr = (tag, name) => ATTR[name].exec(tag)?.[1];
const homeHtml = () => readFileSync(join(DIST, 'index.html'), 'utf8');
/** Cele 10 template-uri ale eroului: [{ index, html, source: { srcset, sizes, media }, img: { srcset, sizes, alt } }] */
function heroTemplates10(html) {
  return [...html.matchAll(/<template id="erou-(\d+)">([\s\S]*?)<\/template>/g)].map((m) => {
    const source = /<source\b[^>]*>/.exec(m[2])?.[0] ?? '';
    const img = /<img\b[^>]*>/.exec(m[2])?.[0] ?? '';
    return {
      index: Number(m[1]),
      html: m[2],
      source: { srcset: attr(source, 'srcset'), sizes: attr(source, 'sizes'), media: attr(source, 'media') },
      img: { srcset: attr(img, 'srcset'), sizes: attr(img, 'sizes'), alt: attr(img, 'alt'), tag: img },
    };
  });
}
const headScriptOf = (html) => inlineScripts(html).find((c) => c.includes('"data-erou"'));
const cloneScriptOf = (html) => inlineScripts(html).find((c) => c.includes('getElementById("erou-"'));

/** Rulează scriptul din <head> cu un document fals; întoarce { attr, links } pentru `Math.random` dat. */
function runHeadScript(code, random) {
  const links = [];
  const attrs = {};
  const el = () => ({ attrs: {}, setAttribute(k, v) { this.attrs[k] = String(v); } });
  const document = {
    documentElement: { setAttribute: (k, v) => { attrs[k] = String(v); } },
    createElement: () => el(),
    head: { appendChild: (l) => links.push(l) },
  };
  runInNewContext(code, { document, Math: { floor: Math.floor, random } });
  return { attrs, links };
}

test('dist: homepage-ul are 10 template-uri ale eroului, în ordinea heroPhotos, fiecare cu <picture> 4:5 pe telefon și 16:9 de la 768 px', (t) => {
  if (!distAvailable(t)) return;
  const html = homeHtml();
  const templates = heroTemplates10(html);
  assert.deepEqual(templates.map((x) => x.index), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  for (const [i, tpl] of templates.entries()) {
    const id = HERO_SET[i];
    assert.equal(tpl.source.media, '(max-width: 767px)', `${id}: media pe <source>`);
    assert.equal(tpl.source.sizes, '50vw', `${id}: sizes pe <source>`);
    assert.equal(tpl.source.srcset, photoPortraitSrcset(id), `${id}: srcset portret`);
    assert.equal(tpl.img.sizes, '100vw', `${id}: sizes pe <img>`);
    assert.equal(tpl.img.srcset, heroSrcset(id), `${id}: srcset erou`);
    assert.equal(tpl.img.alt?.replaceAll('&#38;', '&'), getPhoto(id).alt, `${id}: alt`); // Astro scrie „&” ca „&#38;” în atribute
    assert.match(tpl.img.tag, /\bloading="eager"/);
    assert.match(tpl.img.tag, /\bfetchpriority="high"/);
    assert.match(tpl.html, /<div class="absolute inset-0 bg-gradient-to-t md:hidden /, `${id}: gradient de telefon`);
    assert.match(tpl.html, /<div class="absolute inset-0 hidden bg-gradient-to-t md:block /, `${id}: gradient de desktop`);
    const { gradient } = heroStyle(id);
    assert.ok(tpl.html.includes(gradient.telefon) && tpl.html.includes(gradient.desktop), `${id}: clasele presetului`);
  }
  // sursa HTML nu are alte <picture>/<img> ale eroului în afara template-urilor și a <noscript>-ului
  const rest = html.replace(/<template id="erou-\d+">[\s\S]*?<\/template>/g, '').replace(/<noscript>[\s\S]*?<\/noscript>/g, '');
  for (const id of HERO_SET) {
    for (const v of variants[id]) assert.ok(!new RegExp(`<(?:img|source|link)\\b[^>]*${v.file}`).test(rest), `${id}: ${v.file} în afara template-urilor/noscript`);
  }
});

test('dist: <noscript> din erou are S02 (poza și gradientele), o singură dată; cu JS nu e DOM (S02 nu apare de două ori)', (t) => {
  if (!distAvailable(t)) return;
  const html = homeHtml();
  const hero = /<section id="hero"[\s\S]*?<\/section>/.exec(html)[0];
  const noscripts = [...hero.matchAll(/<noscript>([\s\S]*?)<\/noscript>/g)].map((m) => m[1]);
  assert.equal(noscripts.length, 1, 'un singur <noscript> în erou');
  const s02 = getPhoto('S02');
  assert.ok(noscripts[0].includes(heroSrcset('S02')) && noscripts[0].includes(photoPortraitSrcset('S02')), 'S02 (desktop și portret) în noscript');
  assert.ok(noscripts[0].includes(s02.alt));
  assert.ok(noscripts[0].includes(heroStyle('S02').gradient.telefon) && noscripts[0].includes(heroStyle('S02').gradient.desktop));
  for (const id of HERO_SET.slice(1)) assert.ok(!noscripts[0].includes(getPhoto(id).slug), `${id} în noscript`);
  // noscript-ul și template-ul 0 au același markup pentru S02
  assert.equal(noscripts[0], heroTemplates10(html)[0].html);
});

test('dist: scriptul din <head> alege indexul, îl pune în data-erou și preîncarcă exact fișierele din <picture> (imagesrcset/imagesizes = srcset/sizes)', (t) => {
  if (!distAvailable(t)) return;
  const html = homeHtml();
  const code = headScriptOf(html);
  assert.ok(code, 'scriptul eroului din <head> lipsește');
  assert.ok(html.indexOf(code) < html.indexOf('<body'), 'scriptul trebuie să fie în <head>');
  const templates = heroTemplates10(html);
  for (let i = 0; i < HERO_SET.length; i += 1) {
    const { attrs, links } = runHeadScript(code, () => (i + 0.5) / HERO_SET.length);
    assert.equal(attrs['data-erou'], String(i));
    assert.equal(links.length, 2, `${HERO_SET[i]}: două link-uri de preload`);
    const [phone, desktop] = links.map((l) => l.attrs);
    for (const l of [phone, desktop]) {
      assert.equal(l.rel, undefined, 'rel se setează ca proprietate, nu ca atribut');
      assert.equal(l.fetchpriority, 'high');
    }
    assert.deepEqual([phone.imagesrcset, phone.imagesizes], [templates[i].source.srcset, templates[i].source.sizes], `${HERO_SET[i]}: telefon`);
    assert.deepEqual([desktop.imagesrcset, desktop.imagesizes], [templates[i].img.srcset, templates[i].img.sizes], `${HERO_SET[i]}: desktop`);
  }
  // proprietățile link-ului (rel, as, media): setate ca proprietăți pe elementul creat
  const seen = [];
  const doc = { documentElement: { setAttribute() {} }, createElement: () => ({ attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } }), head: { appendChild: (l) => seen.push(l) } };
  runInNewContext(code, { document: doc, Math: { floor: Math.floor, random: () => 0.05 } });
  assert.deepEqual(seen.map((l) => [l.rel, l.as, l.media]), [['preload', 'image', '(max-width: 767px)'], ['preload', 'image', '(min-width: 768px)']]);
  // Math.random indisponibil sau NaN/în afara intervalului -> prima poză (S02)
  for (const bad of [() => NaN, () => { throw new Error('x'); }, () => 1, () => -1, () => undefined]) {
    assert.equal(runHeadScript(code, bad).attrs['data-erou'], '0');
  }
  assert.equal(runHeadScript(code, () => 0.9999).attrs['data-erou'], '9');
  t.diagnostic(`script <head>: ${code.length} B brut, ${brotliCompressSync(Buffer.from(code)).length} B brotli`);
});

test('dist: scriptul de clonare din erou validează data-erou (index de 1-3 cifre cu template) și clonează template-ul ales fără innerHTML', (t) => {
  if (!distAvailable(t)) return;
  const code = cloneScriptOf(homeHtml());
  assert.ok(code, 'scriptul de clonare lipsește');
  const run = (value, templates = 10) => {
    const inserted = [];
    const template = (n) => ({ content: { cloneNode: (deep) => ({ clone: n, deep }) } });
    const parent = { insertBefore: (node, ref) => inserted.push([node, ref]) };
    const script = { parentNode: parent };
    const document = {
      documentElement: { getAttribute: () => value },
      getElementById: (id) => (/^erou-\d+$/.test(id) && Number(id.slice(5)) < templates && id === `erou-${Number(id.slice(5))}` ? template(Number(id.slice(5))) : null),
      currentScript: script,
    };
    runInNewContext(code, { document });
    assert.equal(inserted.length, 1);
    assert.equal(inserted[0][1], script, 'se inserează înaintea scriptului');
    assert.equal(inserted[0][0].deep, true);
    return inserted[0][0].clone;
  };
  for (let i = 0; i < 10; i += 1) assert.equal(run(String(i)), i);
  // fără limită tacită la 10 poze: un set mai mare funcționează (index de până la 3 cifre)
  for (const i of [10, 11, 99, 100]) assert.equal(run(String(i), 101), i, `index ${i} într-un set mai mare`);
  // valori invalide sau fără template -> prima poză
  for (const bad of [null, '', 'x', '-1', '1.5', '01', ' 3', '3 ', '__proto__', '1000']) assert.equal(run(bad, 101), 0, `valoare „${bad}”`);
  assert.equal(run('10', 10), 0, 'index fără template -> prima poză');
});

test('dist: scripturile inline ale eroului nu citesc și nu scriu nimic din afara paginii (fără URL, cookie, storage, innerHTML, eval)', (t) => {
  if (!distAvailable(t)) return;
  const html = homeHtml();
  const FORBIDDEN = /location|URLSearchParams|document\s*\.\s*cookie|localStorage|sessionStorage|indexedDB|innerHTML|outerHTML|insertAdjacentHTML|eval|document\s*\.\s*write|Function\s*\(|referrer|navigator|fetch\s*\(|XMLHttpRequest|postMessage/;
  for (const [name, code] of [['head', headScriptOf(html)], ['clonare', cloneScriptOf(html)]]) {
    assert.ok(code, `scriptul „${name}” lipsește`);
    assert.doesNotMatch(code, FORBIDDEN, `scriptul „${name}” folosește o interfață interzisă`);
  }
  // singurul atribut al <html> pe care îl scrie scriptul e data-erou
  assert.deepEqual([...headScriptOf(html).matchAll(/setAttribute\(\s*"([^"]+)"/g)].map((m) => m[1]).sort(), ['data-erou', 'fetchpriority', 'imagesizes', 'imagesrcset']);
  // scriptul din sursă, nu doar din dist: aceleași reguli pe src/pages/index.astro și HeroPhotoSet.astro (în afara comentariilor de documentare)
  // (blocurile <script …is:inline…> se extrag fără regex, cu orice ordine a atributelor, inclusiv `slot="head"` și `define:vars`)
  const inlineSource = (file) => htmlBlocks(read(file), 'script', (b) => /\bis:inline\b/.test(b.open));
  for (const file of ['src/pages/index.astro', 'src/components/home/HeroPhotoSet.astro']) {
    const blocks = inlineSource(file);
    assert.ok(blocks.length >= 1, `${file}: niciun script is:inline găsit (testul nu mai verifică nimic)`);
    for (const block of blocks) assert.doesNotMatch(block.open + block.inner, FORBIDDEN, `${file}: interfață interzisă într-un script inline`);
  }
  assert.ok(inlineSource('src/pages/index.astro').some((b) => b.inner.includes('data-erou')), 'scriptul din <head> (data-erou) nu e în src/pages/index.astro');
  assert.ok(inlineSource('src/components/home/HeroPhotoSet.astro').some((b) => b.inner.includes('data-erou')), 'scriptul de clonare (data-erou) nu e în HeroPhotoSet.astro');
  const bytes = Buffer.from(html);
  const tpl = heroTemplateBlocks(html).map((b) => html.slice(b.start, b.end)).join('') + htmlBlocks(html, 'noscript')[0].inner + headScriptOf(html) + cloneScriptOf(html);
  t.diagnostic(`HTML homepage ${bytes.length} B brut, ${brotliCompressSync(bytes).length} B brotli, ${gzipSync(bytes).length} B gzip; partea eroului (template-uri, noscript, scripturi) ${Buffer.byteLength(tpl)} B brut, ${brotliCompressSync(Buffer.from(tpl)).length} B brotli`);
});

test('dist: JSON-LD al homepage-ului are ImageObject pentru cele 10 poze ale eroului și M12, cu creditul furnizorului; fără credit vizibil în erou; P* doar în set', (t) => {
  if (!distAvailable(t)) return;
  const html = homeHtml();
  const nodes = ldScriptBlocks(html).flatMap((b) => {
    const parsed = JSON.parse(b.inner);
    return parsed['@graph'] ?? [parsed];
  });
  const images = nodes.filter((n) => n['@type'] === 'ImageObject' && String(n['@id']).includes('#imagine-actiune-'));
  assert.deepEqual(images.map((n) => n['@id']).sort(), [...HERO_SET, 'M12'].map((id) => imageObject(id)['@id']).sort());
  for (const node of images) {
    const id = [...HERO_SET, 'M12'].find((x) => imageObject(x)['@id'] === node['@id']);
    checkImageObject(node, id);
    assert.equal(node.creditText, BRAND[getPhoto(id).furnizor].credit, `${id}: credit`);
    assert.equal(node.copyrightNotice, `© ${BRAND[getPhoto(id).furnizor].credit}`);
  }
  const hero = /<section id="hero"[\s\S]*?<\/section>/.exec(html)[0];
  assert.doesNotMatch(withoutBlocks(hero, htmlBlocks(hero, 'script')), /<figcaption|Foto:|Credit:|©/, 'credit vizibil în erou');
  // nicio poză Portwest pe „/” în afara template-urilor eroului și a JSON-LD
  const noTemplates = withoutBlocks(html, heroTemplateBlocks(html));
  const stray = withoutBlocks(noTemplates, ldScriptBlocks(noTemplates));
  for (const p of photos.filter((x) => x.furnizor === 'portwest')) {
    for (const v of variants[p.id]) assert.ok(!stray.includes(v.file), `${p.id}: ${v.file} pe „/” în afara template-urilor`);
  }
});

test('dist: clasele presetelor de gradient ale eroului există în CSS-ul generat', (t) => {
  if (!distAvailable(t)) return;
  const css = walk(DIST, (n) => n.endsWith('.css')).map((f) => readFileSync(f, 'utf8')).join('\n');
  // selectorul CSS al unei clase Tailwind: `/` și `%` se escapează cu `\` (fără alte caractere speciale în presetele noastre)
  const selector = (c) => `.${[...c].map((ch) => (ch === '/' || ch === '%' ? `\\${ch}` : ch)).join('')}`;
  for (const preset of Object.values(HERO_GRADIENTS)) for (const c of [...preset.telefon.split(' '), ...preset.desktop.split(' ')]) assert.ok(!c.includes('\\'), `backslash în clasa ${c}`);
  for (const [name, preset] of Object.entries(HERO_GRADIENTS)) {
    for (const classes of Object.values(preset)) {
      for (const c of classes.split(' ')) assert.ok(css.includes(selector(c)), `preset „${name}”: clasa ${c} lipsește din CSS`);
    }
  }
});

// dist sintetic, într-un director temporar
const fileOf = (id, i = 0) => variants[id][i].file;

function withDist(pages, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'poze-dist-'));
  try {
    const used = new Set();
    for (const [rel, html] of Object.entries(pages)) {
      const path = join(dir, rel);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, html);
      for (const m of html.matchAll(/images\/actiune\/([A-Za-z0-9._-]+\.webp)/g)) used.add(m[1]);
    }
    mkdirSync(join(dir, 'images/actiune'), { recursive: true });
    for (const f of used) if (!f.startsWith('LIPSA')) writeFileSync(join(dir, 'images/actiune', f), '');
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
const imgTag = (id, extra = '') =>
  `<img src="/images/actiune/${fileOf(id, 1)}" srcset="${variants[id].map((v) => `/images/actiune/${v.file} ${v.width}w`).join(', ')}" ${extra}>`;
const ldTag = (id) =>
  `<script type="application/ld+json">{"@graph":[{"@type":"ImageObject","contentUrl":"https://youprotect.ro/images/actiune/${variants[id].filter((v) => !v.portret).at(-1).file}"}]}</script>`;
const syntheticProblems = (pages) => withDist(pages, (dir) => distProblems(analyzeDist(dir)));

test('dist (negativ): o poză Portwest pe o pagină nepermisă pică', () => {
  const p = syntheticProblems({ 'ghiduri/x/index.html': `<html>${imgTag('P04')}</html>` });
  assert.match(p.join('\n'), /P04 \(Portwest\) pe \/ghiduri\/x\//);
  // în orice formă: doar JSON-LD, doar style, doar <source>, doar meta
  for (const body of [
    ldTag('P05'),
    `<div style="background-image:url(/images/actiune/${fileOf('P05')})"></div>`,
    `<picture><source srcset="/images/actiune/${fileOf('P05')} 640w"></picture>`,
    `<meta property="og:image" content="https://youprotect.ro/images/actiune/${fileOf('P05')}">`,
    `<script type="application/ld+json">{"contentUrl":"https:\\/\\/youprotect.ro\\/images\\/actiune\\/${fileOf('P05')}"}</script>`,
  ]) {
    assert.match(syntheticProblems({ 'industrii/constructii/index.html': body }).join('\n'), /P05 \(Portwest\) pe \/industrii\/constructii\//, body);
  }
  // pagini permise
  assert.deepEqual(syntheticProblems({ 'industrii/logistica/index.html': imgTag('P04') }), []);
  assert.deepEqual(syntheticProblems({ 'produse/portwest/index.html': imgTag('P04') }), []);
});

test('dist (negativ): aceeași poză pe 3 pagini, erou și dublă pe pagină pică', () => {
  const three = syntheticProblems({
    'a/index.html': imgTag('M01'),
    'b/index.html': imgTag('M01'),
    'c/index.html': imgTag('M01'),
  });
  assert.match(three.join('\n'), /M01: pe 3 pagini/);
  assert.deepEqual(syntheticProblems({ 'a/index.html': imgTag('M01'), 'b/index.html': imgTag('M01') }), []);
  // erou pe o poză cu erou:false; erou pe 2 pagini
  assert.match(syntheticProblems({ 'a/index.html': imgTag('M01', 'fetchpriority="high"') }).join('\n'), /M01.*nu are voie ca erou/);
  assert.match(
    syntheticProblems({
      'a/index.html': imgTag('M02', 'fetchpriority="high"'),
      'b/index.html': imgTag('M02', 'fetchpriority=high'),
    }).join('\n'),
    /M02: erou pe 2 pagini/,
  );
  assert.deepEqual(syntheticProblems({ 'a/index.html': imgTag('M02', 'fetchpriority="high"'), 'b/index.html': imgTag('M02') }), []);
  // două elemente <img> cu aceeași poză pe o pagină
  assert.match(syntheticProblems({ 'a/index.html': imgTag('M01') + imgTag('M01') }).join('\n'), /M01: de două ori pe \/a\//);
  // fișier din afara celor din date și fișier inexistent
  assert.match(syntheticProblems({ 'a/index.html': '<img src="/images/actiune/altceva-123.webp">' }).join('\n'), /necunoscut „altceva-123\.webp”/);
  assert.match(
    withDist({ 'a/index.html': `<img src="/images/actiune/${fileOf('M01')}">` }, (dir) => {
      rmSync(join(dir, 'images/actiune', fileOf('M01')));
      return distProblems(analyzeDist(dir));
    }).join('\n'),
    /nu există în dist\/images\/actiune/,
  );
});

test('dist (pozitiv): aceeași poză în srcset, src, style și JSON-LD pe o pagină nu e „de două ori”', () => {
  const html = `<html>${imgTag('M02', 'fetchpriority="high"')}${ldTag('M02')}<div style="background:url(/images/actiune/${fileOf('M02')})"></div></html>`;
  assert.deepEqual(syntheticProblems({ 'industrii/constructii/index.html': html }), []);
  const { refs } = withDist({ 'industrii/constructii/index.html': html }, (dir) => analyzeDist(dir));
  assert.deepEqual(refs.map((r) => `${r.id}@${r.page}${r.hero ? ' hero' : ''}`), ['M02@/industrii/constructii/ hero']);
  assert.equal(routeOfHtml('index.html'), '/');
  assert.equal(routeOfHtml('404.html'), '/404/');
  assert.equal(routeOfHtml('industrii/logistica/index.html'), '/industrii/logistica/');
});

// Eroul rotativ al homepage-ului: excepția Portwest (decis de Ciprian pe 26.11.2026: setul rotativ al eroului homepage) e strictă.
const SET_LIST = (ids) => `const heroPhotos = [${ids.map((i) => `"${i}"`).join(', ')}];`;
const heroTemplates = (ids) => ids.map((id, i) => `<template id="erou-${i}">${imgTag(id, 'fetchpriority="high"')}</template>`).join('');

test('erou rotativ (sursă): lista heroPhotos din index.astro dă 10 eroi pe „/”; P14-P16 permise doar acolo', () => {
  const analyze = (path, text) => analyzeUsage([page(path, text)]);
  const { refs, problems } = analyze('src/pages/index.astro', SET_LIST(HERO_SET));
  assert.deepEqual(problems, []);
  assert.deepEqual(refs.map((r) => `${r.id}@${r.page} hero=${r.hero} set=${r.heroSet}`), HERO_SET.map((id) => `${id}@/ hero=true set=true`));
  assert.deepEqual(portwestProblems(refs, ALLOWED_PAGES), [], 'P14-P16 pe „/” ca parte din set');
  assert.deepEqual(usageProblems(refs, PHOTOS), []);
  // negativ: orice altceva decât P14-P16, pe „/”, în set
  const bad = (path, text) => portwestProblems(analyze(path, text).refs, ALLOWED_PAGES);
  assert.equal(bad('src/pages/index.astro', SET_LIST(['S02', 'P11'])).length, 1, 'P11 în set pe „/”');
  assert.equal(bad('src/pages/index.astro', SET_LIST(['S02', 'P04'])).length, 1, 'alt P* decât P14-P16');
  assert.equal(bad('src/pages/industrii/constructii.astro', SET_LIST(['P14'])).length, 1, 'P14 pe altă pagină');
  assert.equal(bad('src/pages/industrii/index.astro', SET_LIST(['P15'])).length, 1, 'P15 pe /industrii/');
  assert.equal(bad('src/pages/index.astro', '<ActionPhoto id="P14" sizes="x" />').length, 1, 'P14 ca <ActionPhoto> pe „/”, în afara listei');
  assert.equal(bad('src/pages/index.astro', 'const x = "P14";').length, 1, 'P14 ca literal oarecare pe „/”');
  assert.equal(bad('src/pages/index.astro', '<PageHeader heroPhoto="P14" />').length, 1, 'P14 ca heroPhoto pe „/”');
  // lista acceptă doar literale
  assert.match(analyze('src/pages/index.astro', 'const heroPhotos = ["S02", other];').problems.join('\n'), /heroPhotos: doar literale/);
  // utilizare: S02 are voie pe 2 pagini („/” și ghid), nu pe a treia; una din cele 9 nu are voie ca erou pe a doua pagină
  const usage = (files) => {
    const { refs, problems } = analyzeUsage(files);
    return [...problems, ...usageProblems(refs, PHOTOS)];
  };
  assert.deepEqual(usage([page('src/pages/index.astro', SET_LIST(HERO_SET)), page('src/pages/ghiduri/g.astro', '<GuideLayout photo="S02" />')]), []);
  assert.match(
    usage([
      page('src/pages/index.astro', SET_LIST(HERO_SET)),
      page('src/pages/ghiduri/g.astro', '<GuideLayout photo="S02" />'),
      page('src/pages/industrii/constructii.astro', '<PageHeader heroPhoto="S02" />'),
    ]).join('\n'),
    /S02: pe 3 pagini/,
  );
  assert.match(usage([page('src/pages/index.astro', SET_LIST(HERO_SET)), page('src/pages/industrii/constructii.astro', '<PageHeader heroPhoto="M24" />')]).join('\n'), /M24: erou pe 2 pagini/);
  assert.match(usage([page('src/pages/index.astro', SET_LIST(HERO_SET) + '\n<ActionPhoto id="S02" sizes="x" />')]).join('\n'), /S02: de două ori pe \//);
});

test('erou rotativ (dist sintetic): template-urile eroului și noscript nu numără ca folosire dublă; P14-P16 doar în template/JSON-LD pe „/”', () => {
  const home = (inner) => ({ 'index.html': `<html>${inner}</html>` });
  // S02 în template și în noscript (un <img> în afara template-urilor): corect
  const withNoscript = `${heroTemplates(HERO_SET.slice(0, 1))}<noscript>${imgTag('S02', 'fetchpriority="high"')}</noscript>`;
  assert.deepEqual(syntheticProblems(home(withNoscript)), []);
  // P14-P16 în template pe „/” și în JSON-LD: permise
  assert.deepEqual(syntheticProblems(home(heroTemplates(['S02', 'P14', 'P15', 'P16']) + ldTag('P14') + ldTag('P16'))), []);
  const portwest = (inner) => syntheticProblems(home(inner)).join('\n');
  assert.match(portwest(heroTemplates(['S02', 'P11'])), /P11 \(Portwest\) pe \//);
  assert.match(portwest(heroTemplates(['S02', 'P04'])), /P04 \(Portwest\) pe \//);
  assert.match(portwest(heroTemplates(['S02', 'P14']) + imgTag('P14')), /P14 \(Portwest\) pe \//, 'P14 și în afara template-ului');
  assert.match(portwest(heroTemplates(['S02', 'P14']) + `<div style="background:url(/images/actiune/${fileOf('P14')})"></div>`), /P14 \(Portwest\) pe \//);
  assert.match(portwest(`<noscript>${imgTag('P14')}</noscript>`), /P14 \(Portwest\) pe \//);
  assert.match(syntheticProblems({ 'industrii/constructii/index.html': heroTemplates(['P14']) }).join('\n'), /P14 \(Portwest\) pe \/industrii\/constructii\//);
  // dublura obișnuită rămâne prinsă: două <img> ale aceleiași poze în afara template-urilor
  assert.match(portwest(heroTemplates(['S02']) + imgTag('M24') + imgTag('M24')), /M24: de două ori pe \//);
  // excepția template-urilor eroului e doar pe „/”: pe altă pagină un <template id="erou-3"> cu o poză dublată pică
  assert.match(
    syntheticProblems({ 'a/index.html': `<template id="erou-3">${imgTag('M01')}</template>${imgTag('M01')}` }).join('\n'),
    /M01: de două ori pe \/a\//,
  );
  assert.match(syntheticProblems({ 'a/index.html': `<template id="erou-3">${imgTag('P14')}</template>` }).join('\n'), /P14 \(Portwest\) pe \/a\//);
  // extragerea blocurilor HTML: majuscule, atribute în orice ordine, prefix asemănător
  const sample = '<SCRIPT slot="head" is:inline>a</SCRIPT><scripts>x</scripts><script\n is:inline define:vars={{ H: 1 }}>b</Script >';
  assert.deepEqual(htmlBlocks(sample, 'script').map((b) => b.inner), ['a', 'b']);
  assert.deepEqual(htmlBlocks(sample, 'script', (b) => /define:vars/.test(b.open)).map((b) => b.inner), ['b']);
  assert.equal(withoutBlocks(sample, htmlBlocks(sample, 'script')), '<scripts>x</scripts>');
  assert.deepEqual(htmlBlocks('<script a={1} /><script b>c</script>', 'script').map((b) => b.inner), ['', 'c']);
  // S02 pe o a treia pagină și o poză a setului ca erou pe a doua pagină pică
  assert.match(
    syntheticProblems({ ...home(heroTemplates(['S02'])), 'ghiduri/g/index.html': imgTag('S02'), 'industrii/x/index.html': imgTag('S02') }).join('\n'),
    /S02: pe 3 pagini/,
  );
  assert.match(
    syntheticProblems({ ...home(heroTemplates(['M24'])), 'industrii/x/index.html': imgTag('M24', 'fetchpriority="high"') }).join('\n'),
    /M24: erou pe 2 pagini/,
  );
});

test('dist: fără dist/ pică cu POZE_REQUIRE_DIST=1 și sare altfel', () => {
  assert.equal(distGate(true, true), 'ok');
  assert.equal(distGate(true, false), 'ok');
  assert.equal(distGate(false, true), 'fail');
  assert.equal(distGate(false, false), 'skip');
});

// ---------------------------------------------------------------------------------------------------------------
// 7. scripts/images/poze-actiune-surse.json

test('surse: exact id-urile în ordinea din date, cheia de sursă pe furnizor, fără semnături', () => {
  const surse = JSON.parse(read('scripts/images/poze-actiune-surse.json'));
  assert.deepEqual(surse.map((s) => s.id), photos.map((p) => p.id));
  const KEY = { mascot: 'id_sursa', portwest: 'bynder_asset_id', sirsafety: 'url_sursa' };
  const ALL_KEYS = new Set(Object.values(KEY));
  for (const s of surse) {
    const p = photos.find((x) => x.id === s.id);
    assert.equal(s.furnizor, p.furnizor, `${s.id}: furnizor diferit de date`);
    assert.equal(s.pixeli_din, p.sursa, `${s.id}: pixeli_din diferit de „sursa” din poze-actiune.json`);
    assert.ok(['original', 'preview'].includes(s.pixeli_din), `${s.id}: pixeli_din`);
    const own = KEY[s.furnizor];
    assert.ok(own, `${s.id}: furnizor necunoscut`);
    assert.equal(typeof s[own], 'string', `${s.id}: lipsește ${own}`);
    for (const k of ALL_KEYS) if (k !== own) assert.ok(!(k in s), `${s.id}: cheia ${k} nu e a furnizorului ${s.furnizor}`);
    assert.ok(Array.isArray(s.rezolutie_originala) && s.rezolutie_originala.length === 2 && s.rezolutie_originala.every(Number.isInteger), `${s.id}: rezolutie_originala`);
    if (s.furnizor === 'mascot') assert.match(s.id_sursa, /^[0-9a-f]{32}$/, s.id);
    if ('decupaj' in s) {
      // decupajul (build-poze-actiune.py): exact x, y, latime, inaltime, întregi nenegativi, nevid, în rezoluția originalului
      const d = s.decupaj;
      assert.deepEqual(Object.keys(d).sort(), ['inaltime', 'latime', 'x', 'y'], `${s.id}: cheile decupajului`);
      assert.ok(Object.values(d).every((n) => Number.isInteger(n) && n >= 0) && d.latime > 0 && d.inaltime > 0, `${s.id}: decupaj`);
      if (s.pixeli_din === 'original') {
        assert.ok(d.x + d.latime <= s.rezolutie_originala[0] && d.y + d.inaltime <= s.rezolutie_originala[1], `${s.id}: decupajul iese din original`);
      }
    }
    if (s.furnizor === 'portwest') assert.match(s.bynder_asset_id, /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{16}$/i, s.id);
    if (s.furnizor === 'sirsafety') {
      const u = new URL(s.url_sursa);
      assert.equal(u.protocol, 'https:', s.id);
      assert.equal(u.hostname, 'www.sirsafety.com', s.id);
    }
    for (const [k, v] of Object.entries(s)) {
      if (typeof v !== 'string') continue;
      if (k === 'nota') {
        // text liber: fără URL-uri și fără cuvinte de secrete
        assert.doesNotMatch(v, /:\/\/|\?|token|cookie|signature/i, `${s.id}.nota: URL sau secret în notă`);
        continue;
      }
      assert.doesNotMatch(v, /\?|[&;]|(^|[^a-z])(sig|token|cookie|signature|expires|key)([^a-z]|$)/i, `${s.id}.${k}: parametri sau secrete în valoare`);
    }
  }
});

test('surse: linkul colecției Portwest Media Hub nu stă în repo (scripts/images/)', () => {
  const COLLECTION_PATH = /\/web\/[0-9a-f]{8,}\//i; // fără numele hostului: ancorat pe calea cu hash, nu pe text de URL
  assert.match('https://exemplu.test/web/0123456789abcdef/nume-colectie/', COLLECTION_PATH);
  assert.doesNotMatch('PW_COLLECTION_URL (the link of the EU_ROW mood images collection)', COLLECTION_PATH);
  assert.doesNotMatch('https://exemplu.test/web/<hash>/<collection-name>/', COLLECTION_PATH);
  for (const name of readdirSync(join(ROOT, 'scripts/images'))) {
    if (!/\.(py|json|md)$/.test(name)) continue;
    assert.doesNotMatch(read(`scripts/images/${name}`), COLLECTION_PATH, `${name}: cale de colecție Media Hub (/web/<hash>/) în repo`);
  }
});

// ---------------------------------------------------------------------------------------------------------------
// 8. Ocolirile din afara codului: css/md/mdx/json din src/, css/js din dist/, copii ale variantelor în public/

/**
 * Fișierele din src/ care nu sunt cod analizat de analyzeUsage: css (inclusiv src/styles/*.css), md, mdx, json.
 * Orice `/images/actiune/` sau slug de poză în ele e problemă (o poză cerută așa nu se poate atribui unei pagini).
 * Excluderi: doar src/data/poze-actiune*.json (datele pozelor își conțin propriile slug-uri/fișiere; sunt singura sursă).
 * src/content/products/*.json NU e exclus: nu dă fals-pozitive (fișele de produs nu conțin căi sau slug-uri de poze).
 */
const DATA_EXCLUDED = /^src\/data\/poze-actiune[^/]*\.json$/;
const dataFiles = walk(join(ROOT, 'src'), (n) => /\.(css|md|mdx|json)$/.test(n))
  .map((abs) => ({ path: toPosix(relative(ROOT, abs)), text: readFileSync(abs, 'utf8') }))
  .filter((f) => !DATA_EXCLUDED.test(f.path));

export function assetRefProblems(files, slugs = photos.map((p) => p.slug)) {
  const problems = [];
  for (const { path, text } of files) {
    if (DATA_EXCLUDED.test(path)) continue;
    if (/images\\?\/actiune/.test(text)) problems.push(`${path}: calea /images/actiune/ în sursă (poza se cere doar prin id, nu se poate atribui unei pagini)`);
    for (const s of slugs) if (text.includes(s)) problems.push(`${path}: slug-ul pozei „${s}” în sursă (nu se poate atribui unei pagini)`);
  }
  return problems;
}

/** Căile `/images/actiune/` din fișierele css/js/mjs din `distDir` (chunk-uri, stiluri): nu se pot atribui unei pagini. */
export function distAssetProblems(distDir) {
  return walk(distDir, (n) => /\.(css|js|mjs)$/.test(n))
    .filter((f) => /images\\?\/actiune/.test(readFileSync(f, 'utf8')))
    .map((f) => `${toPosix(relative(distDir, f))}: calea /images/actiune/ într-un fișier css/js (nu se poate atribui unei pagini)`);
}

/**
 * Fișiere din `publicDir`, în afara images/actiune/, cu aceiași octeți (SHA-256) ca vreo variantă din
 * images/actiune/: o copie redenumită ocolește scanarea după nume. Hash-ul se calculează doar pentru fișierele cu
 * dimensiunea unei variante (aceiași octeți implică aceeași dimensiune), deci e rapid și rezultatul e identic cu
 * hash-ul pe toate.
 */
export function publicCopyProblems(publicDir) {
  const actionDir = join(publicDir, 'images/actiune');
  const sha = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
  const variantFiles = existsSync(actionDir) ? readdirSync(actionDir).map((n) => join(actionDir, n)) : [];
  const variantHashes = new Map(variantFiles.map((f) => [sha(f), toPosix(relative(publicDir, f))]));
  const variantSizes = new Set(variantFiles.map((f) => statSync(f).size));
  const problems = [];
  for (const file of walk(publicDir, () => true)) {
    const rel = toPosix(relative(publicDir, file));
    if (rel.startsWith('images/actiune/') || !variantSizes.has(statSync(file).size)) continue;
    const twin = variantHashes.get(sha(file));
    if (twin) problems.push(`public/${rel}: aceiași octeți ca varianta ${twin} (copie a unei poze de acțiune în afara images/actiune/)`);
  }
  return problems;
}

test('ocolire: în src/ (css, md, mdx, json) niciun /images/actiune/ și niciun slug de poză', () => {
  assert.ok(dataFiles.some((f) => f.path === 'src/styles/global.css'), 'scanarea nu vede src/styles/*.css');
  assert.ok(dataFiles.some((f) => f.path.startsWith('src/content/products/')), 'scanarea nu vede fișele de produs');
  assert.deepEqual(assetRefProblems(dataFiles), []);
});

test('ocolire: public/ nu conține copii ale variantelor în afara images/actiune/ (SHA-256)', () => {
  assert.deepEqual(publicCopyProblems(join(ROOT, 'public')), []);
});

test('ocolire: public/images/actiune/ conține exact variantele din date (fără orfane)', () => {
  const expected = Object.values(variants).flatMap((l) => l.map((v) => v.file)).sort();
  assert.deepEqual(readdirSync(join(ROOT, 'public/images/actiune')).sort(), expected);
});

test('ocolire: în dist/ niciun css/js nu conține /images/actiune/', (t) => {
  if (!distAvailable(t)) return;
  assert.deepEqual(distAssetProblems(DIST), []);
});

test('ocolire (negativ): url(/images/actiune/…) într-un .css din src/ pică, și slug-ul în md/json', () => {
  const portwestFile = variants.P04[0].file;
  const css = (text) => assetRefProblems([page('src/styles/x.css', text)]);
  assert.match(css(`.a{background:url(/images/actiune/${portwestFile})}`).join('\n'), /calea \/images\/actiune\//);
  assert.match(css(`.a{background:url("/images/actiune/${portwestFile}")}`).join('\n'), /calea \/images\/actiune\//);
  assert.match(css(`.a{background:url(/images\\/actiune\\/x-portwest-960.webp)}`).join('\n'), /calea \/images\/actiune\//);
  assert.match(css(`/* ${photos.find((p) => p.id === 'P04').slug} */`).join('\n'), /slug-ul pozei/);
  assert.match(assetRefProblems([page('src/content/x.md', `![](/images/actiune/${portwestFile})`)]).join('\n'), /calea/);
  assert.match(assetRefProblems([page('src/content/x.json', `{"img":"${photos[0].slug}"}`)]).join('\n'), /slug-ul pozei/);
  assert.deepEqual(css('.a{background:url(/images/altceva.webp)}'), []);
  // datele pozelor sunt singura excepție
  assert.deepEqual(assetRefProblems([page('src/data/poze-actiune.json', `{"slug":"${photos[0].slug}"}`)]), []);
});

test('ocolire (negativ): /images/actiune/ într-un css/js din dist/ pică', () => {
  const portwestFile = variants.P04[0].file;
  for (const [name, body] of [
    ['_astro/a.css', `.x{background-image:url(/images/actiune/${portwestFile})}`],
    ['_astro/b.js', `export default "/images/actiune/${portwestFile}"`],
    ['_astro/c.js', `const u="\\/images\\/actiune\\/${portwestFile}"`],
  ]) {
    const dir = mkdtempSync(join(tmpdir(), 'poze-distasset-'));
    try {
      mkdirSync(join(dir, '_astro'), { recursive: true });
      writeFileSync(join(dir, name), body);
      assert.match(distAssetProblems(dir).join('\n'), /calea \/images\/actiune\//, name);
      writeFileSync(join(dir, name), 'export default 1');
      assert.deepEqual(distAssetProblems(dir), [], `${name} curat`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

test('ocolire (negativ): copia unei variante, redenumită în public/, pică (SHA-256)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'poze-public-'));
  try {
    mkdirSync(join(dir, 'images/actiune'), { recursive: true });
    mkdirSync(join(dir, 'images/produse'), { recursive: true });
    const bytes = readFileSync(join(ROOT, 'public/images/actiune', variants.M02[0].file));
    writeFileSync(join(dir, 'images/actiune', variants.M02[0].file), bytes);
    writeFileSync(join(dir, 'images/produse/altceva.webp'), Buffer.from('alt continut'));
    assert.deepEqual(publicCopyProblems(dir), []);
    writeFileSync(join(dir, 'images/produse/nume-nevinovat.webp'), bytes); // aceiași octeți, alt nume
    assert.match(publicCopyProblems(dir).join('\n'), /images\/produse\/nume-nevinovat\.webp: aceiași octeți ca varianta images\/actiune\//);
    // altă extensie / alt director: tot pică (conținutul contează, nu numele)
    writeFileSync(join(dir, 'logo.png'), bytes);
    assert.equal(publicCopyProblems(dir).length, 2);
    // aceeași dimensiune, alți octeți: nu pică
    writeFileSync(join(dir, 'images/produse/nume-nevinovat.webp'), Buffer.alloc(bytes.length, 1));
    writeFileSync(join(dir, 'logo.png'), Buffer.alloc(bytes.length, 2));
    assert.deepEqual(publicCopyProblems(dir), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('NOT_PHOTO_IDS: lista de excepții nu conține id-uri reale de poză, iar o excepție funcționează', () => {
  for (const id of NOT_PHOTO_IDS) assert.ok(!photos.some((p) => p.id === id), `NOT_PHOTO_IDS conține id-ul real ${id}: o poză nu poate fi exceptată`);
  const code = "const cod = 'S10';"; // aici S10 e un cod de produs, nu o poză
  const file = [page('src/lib/x.ts', code)];
  // fără excepție: fail-closed, cu mesajul care spune ce să faci
  const without = analyzeUsage(file, { notPhotoIds: new Set() }).problems.join('\n') + usageProblems(analyzeUsage(file, { notPhotoIds: new Set() }).refs, PHOTOS).join('\n');
  assert.match(without, /nu se deduce pagina/);
  assert.match(without, /dacă nu e id de poză, scrie valoarea altfel \(ex\. `S-10`\) sau adaugă excepția în NOT_PHOTO_IDS/);
  assert.match(analyzeUsage([page('src/lib/x.ts', "const a = 'M12';")]).problems.join('\n'), /NOT_PHOTO_IDS/);
  // scrisă altfel, trece
  assert.deepEqual(analyzeUsage([page('src/lib/x.ts', "const cod = 'S-10';")]).problems, []);
  // cu excepția: trece, fără referințe
  const withExc = analyzeUsage(file, { notPhotoIds: new Set(['S10']) });
  assert.deepEqual(withExc.problems, []);
  assert.deepEqual(withExc.refs, []);
  // excepția e pe valoare: alt literal tot pică
  assert.match(analyzeUsage([page('src/lib/x.ts', "const a = 'S10'; const b = 'S11';")], { notPhotoIds: new Set(['S10']) }).problems.join('\n'), /„S11”/);
  // și în fișierele de catalog
  assert.deepEqual(analyzeUsage([page('src/lib/catalog-brands.ts', "const x = 'S10';")], { notPhotoIds: new Set(['S10']) }).problems, []);
  assert.match(analyzeUsage([page('src/lib/catalog-brands.ts', "const x = 'S10';")]).problems.join('\n'), /NOT_PHOTO_IDS/);
});

// Ținta din scriptul de imagini (build-poze-actiune.py) pentru varianta de 768 px a eroilor e 45 KB, dar nu e impusă:
// scriptul doar avertizează când un fișier rămâne peste ea la calitatea minimă. Aici verificăm toleranța reală
// (limita sub care trebuie să rămână fișierele livrate acum); valorile sunt cele de dinainte, nu s-au schimbat.
const HERO_768_MAX = 56 * 1024;
const PORTRAIT_768_MAX = 55 * 1024;

test('poze: decupajul portret (doar eroul homepage-ului) are variantele -p768/-p960 4:5, în afara srcset-ului obișnuit', () => {
  const withPortrait = photos.filter((p) => p.portret);
  assert.ok(withPortrait.length >= 1, 'nicio poză cu decupaj portret');
  for (const p of withPortrait) {
    assert.ok(p.erou, `${p.id}: decupajul portret e doar pentru eroi`);
    const [x0, y0, x1, y1] = p.portret.decupaj;
    assert.ok(0 <= x0 && x0 < x1 && x1 <= 1 && 0 <= y0 && y0 < y1 && y1 <= 1, `${p.id}: decupaj în afara imaginii`);
    const portrait = variants[p.id].filter((v) => v.portret);
    assert.deepEqual(portrait.map((v) => v.width), [768, 960], `${p.id}: variante portret`);
    for (const v of portrait) {
      assert.equal(v.height / v.width, 1.25, `${p.id} ${v.file}: nu e 4:5`);
      assert.match(v.file, /-p(768|960)\.webp$/);
    }
    assert.ok(portrait[0].bytes <= PORTRAIT_768_MAX, `${p.id}: ${portrait[0].file} ${portrait[0].bytes} B (toleranță ${PORTRAIT_768_MAX} B)`);
    assert.ok(!photoSrcset(p.id).includes('-p768') && !photoSrcset(p.id).includes('-p960'), `${p.id}: portretul în srcset-ul obișnuit`);
  }
  for (const p of photos.filter((x) => !x.portret)) {
    assert.ok(!variants[p.id].some((v) => v.portret), `${p.id}: variante portret fără decupaj în date`);
  }
});

// Setul rotativ al eroului homepage-ului (M24–M27, P14–P16, S18, S19) + S02: toate au decupaj portret 4:5 din ORIGINALUL ÎNTREG
// (fracțiile din `portret.decupaj` înmulțite cu rezoluția din surse dau pixeli întregi, raport 4:5 și cel puțin 960 px lățime).
const ROTATIVE = ['M24', 'M25', 'M26', 'M27', 'P14', 'P15', 'P16', 'S18', 'S19'];
const PORTRAIT_768_PRODUCTION = 56144; // octeții portretului p768 al lui S02 în producție: plafonul pentru pozele noi

test('poze: setul rotativ al eroului (9 poze noi) are decupaj portret 4:5 valid din originalul întreg, 768/960/1440/1920 și portret 768/960', () => {
  const surse = JSON.parse(read('scripts/images/poze-actiune-surse.json'));
  for (const id of ROTATIVE) {
    const p = photos.find((x) => x.id === id);
    const s = surse.find((x) => x.id === id);
    assert.ok(p && s, `${id}: lipsește din date sau din surse`);
    assert.equal(p.erou, true, `${id}: erou`);
    assert.deepEqual(p.latimi, [768, 960, 1440, 1920], `${id}: latimi`);
    assert.ok(p.portret && s.decupaj, `${id}: portret și decupaj de desktop`);
    const [W, H] = s.rezolutie_originala;
    const [x0, y0, x1, y1] = p.portret.decupaj;
    assert.ok(0 <= x0 && x0 < x1 && x1 <= 1 && 0 <= y0 && y0 < y1 && y1 <= 1, `${id}: fracții în afara [0,1]`);
    const w = Math.round(x1 * W) - Math.round(x0 * W);
    const h = Math.round(y1 * H) - Math.round(y0 * H);
    assert.ok(Math.abs(w / h - 0.8) <= 0.01, `${id}: decupajul portret ${w}x${h} nu e 4:5`);
    assert.ok(w >= 960, `${id}: decupajul portret ${w} px < 960 px (upscaling)`);
    const { x, y, latime, inaltime } = s.decupaj;
    assert.ok(Math.abs(latime / inaltime - 16 / 9) <= 0.01, `${id}: decupajul de desktop nu e 16:9`);
    assert.ok(x + latime <= W && y + inaltime <= H, `${id}: decupajul de desktop iese din original`);
    const list = variants[id];
    assert.deepEqual(list.filter((v) => !v.portret).map((v) => v.width), [768, 960, 1440, 1920], `${id}: variante desktop`);
    const portrait = list.filter((v) => v.portret);
    assert.deepEqual(portrait.map((v) => v.width), [768, 960], `${id}: variante portret`);
    assert.ok(portrait[0].bytes <= PORTRAIT_768_PRODUCTION, `${id}: ${portrait[0].file} ${portrait[0].bytes} B > ${PORTRAIT_768_PRODUCTION} B`);
    assert.ok(list.every((v) => !v.doar), `${id}: \`doar\` doar la pozele cu două seturi`);
  }
});

test('poze: variantele eroilor sunt 768/960/1440, plus 1920 când sursa nu e pătrată; 768 sub 56 KB (ținta de 45 KB din script nu e impusă)', () => {
  for (const p of photos.filter((x) => x.erou)) {
    // setul de erou: fără decupajul portret și fără fișierele doar de corp (S02-640)
    const list = variants[p.id].filter((v) => !v.portret && v.doar !== 'corp');
    const widths = list.map((v) => v.width);
    assert.deepEqual(widths.slice(0, 3), [768, 960, 1440], `${p.id}: lățimi erou`);
    assert.ok(widths.length === 3 || (widths.length === 4 && widths[3] === 1920), `${p.id}: lățimi erou ${widths}`);
    // sursele pătrate (S06, S17) nu au 1920: nu încap în 250 KB la o calitate acceptabilă
    assert.ok(list[0].bytes <= HERO_768_MAX, `${p.id}: ${list[0].file} ${list[0].bytes} B (toleranță ${HERO_768_MAX} B)`);
  }
});

// Un erou care apare și ca poză de corp (azi S02: erou pe homepage, poză de corp în ghid) are două seturi de lățimi în
// aceleași date: `latimi` (erou, 768/960/1440/1920) și `latimiCorp` (corp, 640/960/1440). Fișierele 960/1440 sunt comune (o
// singură copie pe disc); 640 e doar de corp (`doar: "corp"`), 768 și 1920 doar de erou (`doar: "erou"`).
test('poze: S02 are setul de corp 640/960/1440 (ghidurile, ca înainte de #104) separat de setul de erou 768/960/1440/1920', () => {
  const s02 = photos.find((p) => p.id === 'S02');
  assert.deepEqual(s02.latimiCorp, [640, 960, 1440]);
  assert.deepEqual(s02.latimi, [768, 960, 1440, 1920]);
  const widths = (list) => list.map((v) => v.width);
  assert.deepEqual(widths(photoVariants('S02')), [640, 960, 1440]);
  assert.deepEqual(widths(heroVariants('S02')), [768, 960, 1440, 1920]);
  // același fișier la 960 și 1440 în ambele seturi (nu se duplică)
  const files = (list) => new Map(list.map((v) => [v.width, v.file]));
  for (const w of [960, 1440]) assert.equal(files(photoVariants('S02')).get(w), files(heroVariants('S02')).get(w));
  const srcsetWidths = (srcset) => srcset.split(', ').map((x) => Number(x.split(' ')[1].replace('w', '')));
  assert.deepEqual(srcsetWidths(photoSrcset('S02')), [640, 960, 1440]);
  assert.deepEqual(srcsetWidths(heroSrcset('S02')), [768, 960, 1440, 1920]);
  assert.ok(!/-(768|1920|p768|p960)\.webp/.test(photoSrcset('S02')), 'ghidul nu primește 768/1920/portret');
  assert.ok(!/-640\.webp/.test(heroSrcset('S02')), 'eroul nu primește 640');
  assert.deepEqual(photoSize('S02'), { width: 1440, height: 810 });
  assert.deepEqual(heroSize('S02'), { width: 1920, height: 1080 });
  assert.ok(photoSrc('S02', 960).endsWith('-960.webp') && heroSrc('S02', 960).endsWith('-960.webp'));
  // JSON-LD: cel mai mare fișier real, din orice set
  assert.equal(imageObject('S02').width, 1920);
  assert.ok(imageObject('S02').contentUrl.endsWith('-1920.webp'));
  // `doar` și `latimiCorp` există doar unde sunt două seturi; setul de corp respectă `latimiCorp`, cel de erou `latimi`
  for (const p of photos) {
    const marked = variants[p.id].filter((v) => v.doar);
    if (!p.latimiCorp) {
      assert.deepEqual(marked, [], `${p.id}: \`doar\` fără latimiCorp`);
      continue;
    }
    assert.ok(p.erou, `${p.id}: latimiCorp doar la eroi`);
    assert.deepEqual(widths(photoVariants(p.id)), p.latimiCorp, `${p.id}: set de corp`);
    assert.deepEqual(widths(heroVariants(p.id)), p.latimi, `${p.id}: set de erou`);
    for (const v of marked) assert.ok(['corp', 'erou'].includes(v.doar));
  }
});

test('dist: S02 are 640/960/1440 în ghid și 768/960/1440/1920 pe homepage', (t) => {
  if (!distAvailable(t)) return;
  const slug = photos.find((p) => p.id === 'S02').slug;
  const srcsetOf = (rel) => {
    const html = readFileSync(join(DIST, rel), 'utf8');
    const tag = (html.match(/<img\b[^>]*\baction-photo\b[^>]*>/g) ?? []).find((x) => x.includes(slug));
    assert.ok(tag, `${rel}: fără poza S02`);
    return [...new Set([...tag.matchAll(new RegExp(`${slug}-(\\d+)\\.webp`, 'g'))].map((m) => Number(m[1])))].sort((a, b) => a - b);
  };
  assert.deepEqual(srcsetOf('ghiduri/haine-de-lucru-care-rezista/index.html'), [640, 960, 1440]);
  assert.deepEqual(srcsetOf('index.html'), [768, 960, 1440, 1920]);
});

// Eroul rotativ al homepage-ului: cele 10 poze (ordinea din `heroPhotos`, index.astro), cadrul și gradientul vin din date.
// Tiparul claselor Tailwind dintr-un preset: culoare `yp-black` (sau transparent) cu opacitate opțională, poziții în %.
const GRADIENT_CLASS = /^(?:(?:from|via|to)-(?:yp-black(?:\/\d{1,3})?|transparent)|(?:from|via)-\d{1,3}%)$/;

test('erou: presetele de gradient sunt clase Tailwind literale și valide; „standard” e gradientul de până acum', () => {
  assert.deepEqual(Object.keys(HERO_GRADIENTS), ['standard', 'mediu', 'puternic', 'foarte-puternic']);
  assert.deepEqual(HERO_GRADIENTS.standard, {
    telefon: 'from-yp-black from-5% via-yp-black/70 via-40% to-transparent',
    desktop: 'from-yp-black via-yp-black/70 to-yp-black/30',
  });
  for (const [name, preset] of Object.entries(HERO_GRADIENTS)) {
    for (const [where, classes] of Object.entries(preset)) {
      const list = classes.split(' ');
      for (const c of list) assert.match(c, GRADIENT_CLASS, `${name}.${where}: clasă nevalidă „${c}”`);
      assert.ok(list.some((c) => c.startsWith('from-')) && list.some((c) => c.startsWith('via-')) && list.some((c) => c.startsWith('to-')), `${name}.${where}: lipsesc from/via/to`);
    }
  }
  // literale în sursă (JIT): fiecare clasă apare întreagă în src/lib/erou.ts
  const src = read('src/lib/erou.ts');
  for (const preset of Object.values(HERO_GRADIENTS)) for (const classes of Object.values(preset)) assert.ok(src.includes(`'${classes}'`), `clase compuse, nu literale: ${classes}`);
  assert.ok(!/\$\{/.test(src), 'interpolare în src/lib/erou.ts: clasele trebuie să fie literale');
});

test('erou: cele 10 poze au `eroul` în date (cadru telefon/desktop, preset existent); S02 păstrează cadrul și gradientul de până acum', () => {
  for (const id of HERO_SET) {
    const p = photos.find((x) => x.id === id);
    assert.ok(p.erou && p.portret, `${id}: erou cu decupaj portret`);
    assert.ok(p.eroul, `${id}: lipsește „eroul” în date`);
    assert.ok(Object.hasOwn(HERO_GRADIENTS, p.eroul.gradient), `${id}: preset necunoscut „${p.eroul.gradient}”`);
    for (const k of ['telefon', 'desktop']) assert.match(p.eroul.poz[k], /^\d{1,3}% \d{1,3}%$/, `${id}: poz.${k}`);
    assert.deepEqual(heroStyle(id), { poz: p.eroul.poz, gradient: HERO_GRADIENTS[p.eroul.gradient] });
  }
  assert.deepEqual(photos.filter((p) => p.eroul).map((p) => p.id).sort(), [...HERO_SET].sort(), '`eroul` doar la setul rotativ');
  assert.deepEqual(heroStyle('S02'), { poz: { telefon: '50% 25%', desktop: '70% 30%' }, gradient: HERO_GRADIENTS.standard });
  assert.throws(() => heroStyle('M01'), /M01/);
});

// Contrastul textului alb de pe erou, măsurat pe 26.11.2026 PE LINII (Chrome real, captură cu textul ascuns, p95 al luminanței
// pixelilor de sub fiecare linie, minimul peste linii, toate elementele de text, WCAG) la 390 (DPR 3), 768, 1024, 1440 și 1920 px.
// Cu „standard” cădeau sub 4,6:1: M24 (4,44 la 1920 px), P14 (4,48 la 768 px) și P16 (4,35 la 1440 px); acestea folosesc „mediu”
// (minim 5,49:1). Restul trec cu „standard” (minim 4,74:1, M26 la 1440 px). Dacă schimbi un preset sau un cadru (`poz`), re-măsoară
// contrastul pe toate pozele și pe toate lățimile și actualizează lista de mai jos.
const HERO_GRADIENTS_IN_USE = { S02: 'standard', M24: 'mediu', M25: 'standard', M26: 'standard', M27: 'standard', P14: 'mediu', P15: 'standard', P16: 'mediu', S18: 'standard', S19: 'standard' };

test('erou: presetele de gradient folosite sunt cele măsurate pentru contrast, iar S02 are gradientul și cadrul de pe main', () => {
  assert.deepEqual(Object.fromEntries(HERO_SET.map((id) => [id, photos.find((p) => p.id === id).eroul.gradient])), HERO_GRADIENTS_IN_USE);
  assert.deepEqual(photos.find((p) => p.id === 'S02').eroul, { poz: { telefon: '50% 25%', desktop: '70% 30%' }, gradient: 'standard' });
});

test('erou: heroPreload() dă slug-ul și lățimile din care scriptul din <head> reface exact srcset-urile din <picture>', () => {
  const data = heroPreload(HERO_SET);
  assert.equal(data.dir, '/images/actiune/');
  assert.equal(data.photos.length, HERO_SET.length);
  for (const [i, [slug, hero, portrait]] of data.photos.entries()) {
    const id = HERO_SET[i];
    const rebuilt = (prefix, widths) => widths.map((w) => `${data.dir}${slug}-${prefix}${w}.webp ${w}w`).join(', ');
    assert.equal(rebuilt('', hero), heroSrcset(id), `${id}: srcset erou`);
    assert.equal(rebuilt('p', portrait), photoPortraitSrcset(id), `${id}: srcset portret`);
  }
});

// ---------------------------------------------------------------------------------------------------------------
// Pozele din corp pe telefon 3x: `sizes` normalizat de ActionPhoto (bodySizes), ca browserul să aleagă 960 px, nu 1440 px.

test('bodySizes: regula de telefon 3x se pune imediat înaintea ultimei intrări calc(100vw - 2rem); restul trece neschimbat', () => {
  const rule = BODY_PHONE_HIDPI;
  assert.equal(PHONE_FULL_WIDTH, 'calc(100vw - 2rem)');
  assert.match(rule, /^\(max-width: 767px\) and \(min-resolution: 2\.5dppx\) calc\(\(100vw - 2rem\) \* 0\.75\)$/);
  assert.equal(bodySizes('calc(100vw - 2rem)'), `${rule}, calc(100vw - 2rem)`);
  assert.equal(
    bodySizes('(min-width: 1280px) 1248px, calc(100vw - 2rem)'),
    `(min-width: 1280px) 1248px, ${rule}, calc(100vw - 2rem)`,
  );
  assert.equal(
    bodySizes('(min-width: 768px) 768px,calc(100vw - 2rem)'),
    `(min-width: 768px) 768px, ${rule}, calc(100vw - 2rem)`,
  );
  // intrările condiționate ale paginii (ex. 640-767 px) rămân ÎNAINTEA regulii, deci câștigă în intervalul lor
  assert.equal(
    bodySizes('(min-width: 1024px) 38vw, (min-width: 640px) 48vw, calc(100vw - 2rem)'),
    `(min-width: 1024px) 38vw, (min-width: 640px) 48vw, ${rule}, calc(100vw - 2rem)`,
  );
  const parts = bodySizes('(min-width: 640px) 48vw, calc(100vw - 2rem)').split(', ');
  assert.ok(parts.indexOf('(min-width: 640px) 48vw') < parts.indexOf(rule), 'regula nu trebuie să preceadă intrările paginii');
  assert.equal(parts[parts.length - 1], PHONE_FULL_WIDTH);
  // alte valori implicite pe telefon: neschimbate (eroi, 70vw, 100vw, intrări cu calc înăuntru care nu sunt ultima)
  for (const same of ['100vw', '40vw', '(min-width: 1024px) 38vw, 70vw', '(min-width: 640px) calc(100vw - 2rem), 70vw', 'calc(100vw - 2rem) 1px']) {
    assert.equal(bodySizes(same), same, same);
  }
  // regula nu atinge niciun viewport de la 768 px în sus și nici DPR sub 2,5
  assert.match(rule, /max-width: 767px/);
  assert.match(rule, /min-resolution: 2\.5dppx/);
});

test('ActionPhoto: pozele din corp trec prin bodySizes; eroii (priority) și decupajul portret își păstrează sizes', () => {
  const src = read('src/components/media/ActionPhoto.astro');
  assert.match(src, /import \{[^}]*\bbodySizes\b[^}]*\} from '\.\.\/\.\.\/lib\/poze-actiune'/);
  assert.match(src, /const imgSizes = priority \|\| portret \? sizes : bodySizes\(sizes\)/);
  assert.equal((src.match(/sizes=\{imgSizes\}/g) ?? []).length, 2, 'ambele <img> folosesc imgSizes');
  assert.ok(!/ sizes=\{sizes\}/.test(src), 'niciun <img> cu sizes brut');
  assert.match(src, /if \(!sizes\) throw/, 'sizes rămâne obligatoriu');
});

test('dist: pozele din corp cu calc(100vw - 2rem) pe telefon au regula 3x; eroii (fetchpriority=high) nu', (t) => {
  if (!distAvailable(t)) return;
  let withRule = 0;
  for (const file of walk(DIST, (n) => n.endsWith('.html'))) {
    const html = readFileSync(file, 'utf8');
    for (const tag of html.match(/<img\b[^>]*\bclass="[^"]*\baction-photo\b[^>]*>/g) ?? []) {
      const sizes = /\bsizes="([^"]*)"/.exec(tag)?.[1];
      assert.ok(sizes, `${relative(DIST, file)}: poză fără sizes`);
      const hero = /fetchpriority="high"/.test(tag);
      const entries = sizes.replaceAll('&#38;', '&').split(/,\s*(?![^(]*\))/);
      if (hero) continue;
      // regula stă imediat înaintea ultimei intrări (calc(100vw - 2rem)), după intrările condiționate ale paginii
      if (entries.at(-2) === BODY_PHONE_HIDPI && entries.at(-1) === PHONE_FULL_WIDTH) withRule += 1;
      else if (entries.at(-1) === PHONE_FULL_WIDTH) assert.fail(`${relative(DIST, file)}: sizes fără regula 3x: ${sizes}`);
    }
  }
  assert.ok(withRule > 0, 'nicio poză din corp cu regula 3x în dist/: verificarea nu vede nimic');
});
