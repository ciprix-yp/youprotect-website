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
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACTION_PHOTOS, imageObject, imageObjects, imageGraph, imageRef, photoSrcset, photoSrc, getPhoto } from '../src/lib/poze-actiune.ts';
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
]);
const ALLOWED_EXPR = /^(?:page\.photo|photo|heroPhoto)$/;
/** Fișierele care definesc sau documentează pozele: nu sunt „utilizări”. */
const NOT_USAGE = new Set(['src/components/media/ActionPhoto.astro', 'src/lib/poze-actiune.ts']);
const CATALOG_FILES = new Set(['src/lib/catalog-brands.ts', 'src/lib/catalog-categories.ts']);
const PHOTO_CALLS = ['photoSrc', 'photoSrcset', 'photoSize', 'imageObject', 'imageObjects', 'imageGraph', 'imageRef', 'getPhoto'];
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
const DYNAMIC_ARGS = /^\[?(?:page\.photo|photo|heroPhoto)\]?(?:,[0-9]+)?$/;

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
export function analyzeUsage(files, { catalog = [], slugs = photos.map((p) => p.slug) } = {}) {
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
      if (isConsumed(m.index)) continue;
      if (isCatalog) {
        if (!/(?<![-\w.?$])(?:photo|heroPhoto)\s*:\s*$/.test(text.slice(Math.max(0, m.index - 40), m.index)) || m[1] === '`') {
          bad(`„${m[2]}” în catalog doar ca \`photo: 'ID'\` sau \`heroPhoto: 'ID'\``);
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
      bad(`poze („${found.map((f) => f.id).join('”, „')}”) într-un fișier din care nu se deduce pagina`);
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

/** Regula Portwest: P* doar pe paginile permise (set de rute). */
export function portwestProblems(refs, allowedPages) {
  return refs
    .filter((r) => r.id.startsWith('P') && !allowedPages.has(r.page))
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
  assert.equal(bad('src/lib/x.ts', '', [{ slug: 'portwest', photo: 'P13' }]).length, 0);
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
    for (const name of names) {
      const id = fileToId.get(name);
      if (!id) problems.push(`${rel}: fișier de poză de acțiune necunoscut „${name}” (nu e în poze-actiune-variante.json)`);
      else ids.add(id);
      if (!existsSync(join(distDir, 'images/actiune', name))) problems.push(`${rel}: „${name}” nu există în dist/images/actiune/`);
    }
    for (const tag of html.matchAll(/<(img|link|source)\b[^>]*>/gi)) {
      if (!/images\\?\/actiune\\?\//.test(tag[0])) continue;
      const tagIds = new Set(
        [...tag[0].matchAll(/images\\?\/actiune\\?\/([A-Za-z0-9._-]+)/g)].map((m) => fileToId.get(m[1].replace(/\.+$/, ''))).filter(Boolean),
      );
      for (const id of tagIds) {
        if (/fetchpriority\s*=\s*["']?high/i.test(tag[0])) hero.add(id);
        if (tag[1].toLowerCase() === 'img') imgCount.set(id, (imgCount.get(id) ?? 0) + 1);
      }
    }
    for (const [id, n] of imgCount) if (n > 1) problems.push(`${id}: de două ori pe ${route} (${n} elemente <img>)`);
    for (const id of ids) refs.push({ id, page: route, hero: hero.has(id), render: true, file: rel });
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
  `<script type="application/ld+json">{"@graph":[{"@type":"ImageObject","contentUrl":"https://youprotect.ro/images/actiune/${variants[id].at(-1).file}"}]}</script>`;
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
  // fișier din afara celor 22 și fișier inexistent
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

test('dist: fără dist/ pică cu POZE_REQUIRE_DIST=1 și sare altfel', () => {
  assert.equal(distGate(true, true), 'ok');
  assert.equal(distGate(true, false), 'ok');
  assert.equal(distGate(false, true), 'fail');
  assert.equal(distGate(false, false), 'skip');
});

// ---------------------------------------------------------------------------------------------------------------
// 7. scripts/images/poze-actiune-surse.json

test('surse: exact cele 22 de id-uri în ordinea din date, cheia de sursă pe furnizor, fără semnături', () => {
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
