// Gărzi pentru migrarea la Tailwind 4 (de la 3.4), ca să nu se piardă tăcut ce s-a păstrat cu grijă la migrare.
//   1. Integrare: plugin Vite, fără PostCSS/autoprefixer/tailwind.config.mjs, fără directive v3 în global.css.
//   2. Tokenii din @theme (culori, umbre, curbe, fonturi) au exact valorile din vechiul tailwind.config.mjs; utilitarele lor
//      se generează (compilare reală cu @tailwindcss/node, fără rețea; tokenii nefolosiți nu ajung în dist/, deci nu se pot
//      verifica acolo).
//   3. Paritatea de hover cu `future.hoverOnlyWhenSupported` din v3: orice `:hover` produs de o variantă Tailwind stă în
//      `@media (hover: hover) and (pointer: fine)`. Se verifică (a) varianta din global.css, (b) compilarea unor candidați,
//      (c) CSS-ul din dist/ (ca la celelalte teste pe dist: fără dist/ sare; cu POZE_REQUIRE_DIST=1 pică).
//   4. Clase din v3 eliminate sau redenumite în v4 nu mai apar în src/ (detectorul are propriile cazuri de control).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(ROOT, 'src');
const DIST = join(ROOT, 'dist');
const HAS_DIST = existsSync(DIST) && statSync(DIST).isDirectory();
const REQUIRE_DIST = process.env.POZE_REQUIRE_DIST === '1';
const HOVER_MEDIA = '(hover:hover) and (pointer:fine)';

const read = (p) => readFileSync(p, 'utf8');
const globalCss = read(join(SRC, 'styles', 'global.css'));
// Fără comentarii, dar păstrează șirurile: `@source '../**/*.astro'` conține `/**/`, care nu e comentariu.
const noComments = (css) => css.replace(/("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|\/\*[\s\S]*?\*\//g, (_m, str) => str ?? '');
const normalizeMedia = (s) => s.replace(/\s+/g, ' ').replace(/\(\s*/g, '(').replace(/\s*\)/g, ')').replace(/:\s*/g, ':').trim();

function guardDist(name, fn) {
  test(name, (t) => {
    if (!HAS_DIST) {
      if (REQUIRE_DIST) assert.fail('POZE_REQUIRE_DIST=1, dar dist/ lipsește: rulează `npm run build`');
      t.skip('fără dist/');
      return;
    }
    fn();
  });
}

/** Parser mic de CSS: întoarce { selector, ancestors } pentru fiecare bloc care nu e at-rule (ancestors = preludiile at-rule-urilor). */
export function cssRules(css) {
  const rules = [];
  const stack = [];
  let buf = '';
  let quote = null;
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (quote) {
      buf += c;
      if (c === '\\') buf += css[++i] ?? '';
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '\\') {
      // Selectorii Tailwind conțin caractere scăpate (`\:`, `\'`, `\/`): nu deschid un șir.
      buf += c + (css[++i] ?? '');
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      buf += c;
      continue;
    }
    if (c === '/' && css[i + 1] === '*') {
      i = css.indexOf('*/', i + 2);
      if (i === -1) break;
      i += 1;
      continue;
    }
    if (c === '{') {
      const prelude = buf.trim();
      if (!prelude.startsWith('@')) rules.push({ selector: prelude, ancestors: [...stack] });
      stack.push(prelude);
      buf = '';
    } else if (c === '}') {
      stack.pop();
      buf = '';
    } else if (c === ';') {
      buf = '';
    } else {
      buf += c;
    }
  }
  return rules;
}

/** Regulile cu `:hover` în selector care NU au printre strămoși media query-ul de hover (cu mouse). */
export function hoverOutsideMedia(css) {
  return cssRules(css).filter(
    (r) => /:hover/.test(r.selector) && !r.ancestors.some((a) => a.startsWith('@media') && normalizeMedia(a.slice(6)).includes(HOVER_MEDIA)),
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// 1. Integrare
// ---------------------------------------------------------------------------------------------------------------------

test('Tailwind 4: plugin Vite în astro.config.mjs, fără PostCSS, autoprefixer sau tailwind.config.mjs', () => {
  const pkg = JSON.parse(read(join(ROOT, 'package.json')));
  const all = { ...pkg.dependencies, ...pkg.devDependencies };
  assert.match(all.tailwindcss ?? '', /^[\^~]?4\./, 'tailwindcss trebuie să fie 4.x');
  assert.match(all['@tailwindcss/vite'] ?? '', /^[\^~]?4\./, '@tailwindcss/vite trebuie să fie 4.x');
  assert.equal(all.autoprefixer, undefined, 'autoprefixer: Tailwind 4 (Lightning CSS) îl face inutil');
  assert.equal(all.postcss, undefined, 'postcss nu mai e dependență directă');
  for (const f of ['postcss.config.mjs', 'postcss.config.js', 'postcss.config.cjs', 'tailwind.config.mjs', 'tailwind.config.js', 'tailwind.config.cjs']) {
    assert.equal(existsSync(join(ROOT, f)), false, `${f} nu mai are ce căuta (configurația e în global.css)`);
  }
  const astro = noComments(read(join(ROOT, 'astro.config.mjs')));
  assert.match(astro, /from\s+'@tailwindcss\/vite'/);
  assert.match(astro, /vite:\s*\{[^}]*plugins:\s*\[\s*tailwindcss\(\)/s, 'tailwindcss() trebuie să fie în vite.plugins');
});

test('global.css: sintaxă Tailwind 4, fără directive sau funcții din v3', () => {
  const css = noComments(globalCss);
  assert.match(css, /@import\s+'tailwindcss'/);
  assert.doesNotMatch(css, /@tailwind\s+(base|components|utilities)/, '@tailwind base/components/utilities e din v3');
  assert.doesNotMatch(css, /@config\b/, 'nu se mai încarcă un tailwind.config');
  assert.doesNotMatch(css, /\btheme\(/, 'theme() e din v3: folosește var(--…)');
  assert.doesNotMatch(css, /@apply\b/, 'global.css nu folosește @apply');
  assert.match(css, /@source\s+'[^']*src[^']*'|@import\s+'tailwindcss'\s+source\(none\)/, 'clasele se caută doar în src/ (altfel Tailwind 4 scanează tot repo-ul)');
  assert.match(css, /@import\s+'tailwindcss'\s+source\(none\)/);
  assert.match(css, /@source\s+'\.\.\/\*\*\/\*\.\{[^}]*astro[^}]*tsx[^}]*\}'/, '@source acoperă fișierele .astro și .tsx din src/');
});

// ---------------------------------------------------------------------------------------------------------------------
// 2. Tokenii din @theme
// ---------------------------------------------------------------------------------------------------------------------

function themeTokens() {
  const css = noComments(globalCss);
  const start = css.indexOf('@theme');
  assert.ok(start !== -1, 'lipsește @theme în global.css');
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  const tokens = new Map();
  for (const m of css.slice(open + 1, close).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) tokens.set(m[1], m[2].replace(/\s+/g, ' ').trim());
  return tokens;
}

const EXPECTED_THEME = {
  // culori (tailwind.config.mjs din v3, `colors` extinse)
  '--color-yp-black': '#0A0A0A',
  '--color-yp-yellow': '#E3FC02',
  '--color-yp-green': '#0F766E',
  '--color-yp-gray': '#2E2E2E',
  '--color-yp-white': '#FFFFFF',
  '--color-yp-surface': '#121212',
  '--color-yp-surface-2': '#181818',
  '--color-yp-well': '#EFEEEA',
  // umbre (`boxShadow`)
  '--shadow-card': 'inset 0 1px 0 0 rgba(255,255,255,0.06), 0 24px 48px -28px rgba(0,0,0,0.95)',
  '--shadow-card-hover': 'inset 0 1px 0 0 rgba(255,255,255,0.09), 0 36px 64px -30px rgba(0,0,0,1), 0 0 0 1px rgba(227,252,2,0.25)',
  // curbe (`transitionTimingFunction`)
  '--ease-out-strong': 'cubic-bezier(0.23, 1, 0.32, 1)',
  '--ease-drawer': 'cubic-bezier(0.32, 0.72, 0, 1)',
  // fonturi (`fontFamily`)
  '--font-heading': 'Montserrat, "Montserrat Fallback", sans-serif',
  '--font-body': '"YP Text", "YP Text Fallback", sans-serif',
  '--font-accent': 'Playfair Display, serif',
  // Culorile din paleta implicită fixate la valorile din v3 (în v4 paleta e în oklch, cu alte nuanțe)
  '--color-red-400': '#f87171',
  '--color-neutral-400': '#a3a3a3',
};

test('@theme: culorile, umbrele, curbele și fonturile au exact valorile din Tailwind 3', () => {
  const tokens = themeTokens();
  for (const [name, value] of Object.entries(EXPECTED_THEME)) {
    assert.equal(tokens.get(name), value, `${name}`);
  }
});

test('@theme: nu apare niciun token în plus față de cei așteptați (o adăugare e decizie conștientă: se actualizează testul)', () => {
  assert.deepEqual([...themeTokens().keys()].sort(), Object.keys(EXPECTED_THEME).sort());
});

test('@theme: `--ease-out` nu e redefinit (ar înlocui curba standard a utilitarului `ease-out`)', () => {
  assert.equal(themeTokens().has('--ease-out'), false);
  assert.doesNotMatch(noComments(globalCss), /var\(--ease-out\)/, 'folosește var(--ease-out-strong)');
});

async function compileCandidates(candidates) {
  // @tailwindcss/node vine odată cu @tailwindcss/vite (dependență directă); compilarea e locală, fără rețea.
  const { compile } = await import('@tailwindcss/node');
  const base = join(SRC, 'styles');
  const compiler = await compile(globalCss, { base, onDependency() {} });
  return compiler.build(candidates);
}

test('@theme: utilitarele din tokeni se generează cu valorile din v3', async () => {
  const out = await compileCandidates([
    'bg-yp-black', 'bg-yp-yellow', 'bg-yp-green', 'bg-yp-gray', 'bg-yp-white', 'bg-yp-surface', 'bg-yp-surface-2', 'bg-yp-well',
    'shadow-card', 'shadow-card-hover', 'ease-out-strong', 'ease-drawer', 'font-heading', 'font-body', 'font-accent',
  ]);
  const rules = new Map();
  for (const m of out.matchAll(/^\s*\.([^\s{]+)\s*\{([^}]*)\}/gm)) rules.set(m[1], m[2].replace(/\s+/g, ' ').trim());
  const decl = (cls) => {
    assert.ok(rules.has(cls), `utilitarul .${cls} nu s-a generat`);
    return rules.get(cls);
  };
  for (const [cls, v] of [['bg-yp-black', 'yp-black'], ['bg-yp-yellow', 'yp-yellow'], ['bg-yp-green', 'yp-green'], ['bg-yp-gray', 'yp-gray'],
    ['bg-yp-white', 'yp-white'], ['bg-yp-surface', 'yp-surface'], ['bg-yp-surface-2', 'yp-surface-2'], ['bg-yp-well', 'yp-well']]) {
    assert.equal(decl(cls), `background-color: var(--color-${v});`);
  }
  assert.match(decl('shadow-card'), /--tw-shadow: inset 0 1px 0 0 var\(--tw-shadow-color, rgba\(255,255,255,0\.06\)\), 0 24px 48px -28px var\(--tw-shadow-color, rgba\(0,0,0,0\.95\)\)/);
  assert.match(decl('shadow-card-hover'), /0 36px 64px -30px var\(--tw-shadow-color, rgba\(0,0,0,1\)\), 0 0 0 1px var\(--tw-shadow-color, rgba\(227,252,2,0\.25\)\)/);
  assert.match(decl('ease-out-strong'), /transition-timing-function: var\(--ease-out-strong\)/);
  assert.match(decl('ease-drawer'), /transition-timing-function: var\(--ease-drawer\)/);
  for (const f of ['heading', 'body', 'accent']) assert.equal(decl(`font-${f}`), `font-family: var(--font-${f});`);
  // Variabilele folosite de utilitare își primesc valorile din @theme
  assert.match(out, /--color-yp-yellow:\s*#E3FC02/i);
  assert.match(out, /--ease-drawer:\s*cubic-bezier\(0\.32, 0\.72, 0, 1\)/);
});

// ---------------------------------------------------------------------------------------------------------------------
// 3. Hover doar cu mouse (paritate cu future.hoverOnlyWhenSupported)
// ---------------------------------------------------------------------------------------------------------------------

test('hover: @custom-variant hover din global.css e exact (hover: hover) și (pointer: fine)', () => {
  const css = noComments(globalCss);
  const m = /@custom-variant\s+hover\s*\{\s*@media\s*([^{]+)\{\s*&:hover\s*\{\s*@slot;\s*\}\s*\}\s*\}/.exec(css);
  assert.ok(m, 'lipsește @custom-variant hover { @media … { &:hover { @slot; } } }');
  assert.equal(normalizeMedia(m[1]), HOVER_MEDIA);
});

test('hover: variantele Tailwind compilate produc :hover doar în media query-ul cu mouse', async () => {
  const out = await compileCandidates([
    'hover:bg-yp-yellow', 'hover:text-white', 'hover:border-yp-yellow/30', 'hover:shadow-card-hover', 'hover:scale-110',
    'group-hover:opacity-100', 'group-hover:scale-[1.04]', 'md:group-hover:grayscale-0', 'md:hover:underline', 'lg:hover:border-yp-yellow/60',
    'aria-disabled:hover:text-white', 'peer-hover:opacity-50',
  ]);
  const hovers = cssRules(out).filter((r) => /:hover/.test(r.selector));
  assert.ok(hovers.length >= 10, `prea puține reguli :hover compilate (${hovers.length})`);
  assert.deepEqual(hoverOutsideMedia(out).map((r) => r.selector), [], 'reguli :hover în afara @media (hover: hover) and (pointer: fine)');
});

test('hover (detector): prinde un :hover scris în afara media query-ului și un media query doar cu (hover: hover)', () => {
  const bad = '.a:hover{color:red}@media (hover:hover){.b:hover{color:red}}@media (hover:hover) and (pointer:fine){.c:hover{color:red}}';
  assert.deepEqual(hoverOutsideMedia(bad).map((r) => r.selector), ['.a:hover', '.b:hover']);
  const escaped = '@media (hover: hover) and (pointer: fine){.before\\:content-\\[\\\'\\\'\\]:hover{x:y}}.z\\:q:hover{x:y}';
  assert.deepEqual(hoverOutsideMedia(escaped).map((r) => r.selector), ['.z\\:q:hover'], 'selectorii cu caractere scăpate nu trebuie să strice parserul');
});

test('global.css: nicio regulă scrisă de mână cu :hover în afara unui media query de hover', () => {
  const outside = hoverOutsideMedia(noComments(globalCss)).filter((r) => !r.ancestors.some((a) => /@custom-variant/.test(a)));
  assert.deepEqual(outside.map((r) => r.selector), []);
});

guardDist('dist: toate regulile :hover din CSS-ul compilat stau în (hover: hover) and (pointer: fine)', () => {
  const dir = join(DIST, '_astro');
  const files = readdirSync(dir).filter((f) => f.endsWith('.css'));
  assert.ok(files.length >= 1, 'niciun fișier .css în dist/_astro');
  let total = 0;
  for (const f of files) {
    const css = read(join(dir, f));
    total += cssRules(css).filter((r) => /:hover/.test(r.selector)).length;
    // Excepție cunoscută (și în Tailwind 3): varianta arbitrară `[&_a:hover]:…` nu trece prin varianta hover.
    const outside = hoverOutsideMedia(css).filter((r) => !/^\.\\\[\\&_a\\:hover\\\]\\:/.test(r.selector));
    assert.deepEqual(outside.map((r) => r.selector), [], `${f}: :hover în afara media query-ului`);
  }
  assert.ok(total >= 20, `prea puține reguli :hover în dist (${total}): CSS-ul nu mai are efectele de hover?`);
});

guardDist('dist: gradientul eroului folosește interpolare sRGB și clasele presetelor există în CSS', () => {
  const dir = join(DIST, '_astro');
  const css = readdirSync(dir).filter((f) => f.endsWith('.css')).map((f) => read(join(dir, f))).join('\n');
  assert.match(css, /\.bg-linear-to-t\\\/srgb\{[^}]*--tw-gradient-position:to top in srgb/);
  const erou = read(join(SRC, 'lib', 'erou.ts'));
  const classes = new Set();
  for (const m of erou.matchAll(/'([^'\n]*\b(?:from|via|to)-[^'\n]*)'/g)) for (const t of m[1].split(/\s+/)) classes.add(t);
  assert.ok(classes.size >= 12, 'nu s-au găsit clasele gradientelor în erou.ts');
  const esc = (t) => t.replace(/[:/.%[\]]/g, (c) => `\\${c}`);
  for (const t of classes) assert.ok(css.includes(`.${esc(t)}{`) || css.includes(`.${esc(t)},`), `clasa ${t} din erou.ts lipsește din CSS-ul compilat`);
});

// ---------------------------------------------------------------------------------------------------------------------
// 4. Clase din v3 eliminate sau redenumite
// ---------------------------------------------------------------------------------------------------------------------

// Fără variante (`md:`, `hover:`…) și fără `!`/`-` în față; se compară cu tokenul gol de variante.
const REMOVED = new Set([
  'outline-none', // v4: outline-none = fără stil de contur; echivalentul din v3 e outline-hidden
  'outline', // v4: outline-solid
  'rounded', // v4: rounded-sm
  'shadow', 'shadow-sm', 'drop-shadow', 'drop-shadow-sm', 'blur', 'blur-sm', 'backdrop-blur', 'backdrop-blur-sm', // sufixe noi (xs/sm)
  'ring', // v3: 3px; v4: 1px
  'order-none', // v4: order-0
  'overflow-ellipsis', // v4: text-ellipsis
  'decoration-slice', 'decoration-clone', // v4: box-decoration-*
  'flex-shrink', 'flex-grow', // v4: shrink / grow
]);
const REMOVED_PATTERNS = [
  [/^flex-(shrink|grow)-\d+$/, 'flex-shrink-N/flex-grow-N: shrink-N/grow-N'],
  [/^bg-gradient-to-(t|tr|r|br|b|bl|l|tl)$/, 'bg-gradient-to-*: bg-linear-to-*'],
  [/^(bg|text|border|divide|ring|placeholder)-opacity-\d+$/, '*-opacity-N: modificatorul /N'],
  [/^[a-z][a-z-]*-\[--[\w-]+\]$/, 'bg-[--x]: bg-(--x)'],
];
// `rounded-sm` din v3 (2px) a devenit `rounded-xs`, iar `rounded` (4px) a devenit `rounded-sm`: nu se poate distinge din text.
// Locurile unde `rounded-sm` (v4, 4px) e intenționat, migrat din `rounded`; un loc nou cere o decizie și o intrare aici.
const ROUNDED_SM_FILES = new Set([
  'src/components/calculator/TCOCalculator.tsx',
  'src/components/forms/MultiStepForm.tsx',
  'src/components/global/Analytics.astro',
  'src/pages/confirmare.astro',
]);
// `!` la început e încă acceptat în v4, dar depreciat în favoarea `mt-0!`: nicio excepție rămasă.
const LEADING_BANG_FILES = new Map();

const STRONG = /^(?:[a-z0-9]+:)*!?-?(?:bg|text|px|py|pt|pb|pl|pr|mt|mb|ml|mr|mx|my|p|m|w|h|min-h|min-w|max-w|max-h|gap|flex|grid|items|justify|font|border|rounded|shadow|opacity|z|top|left|right|bottom|inset|overflow|aspect|space|leading|tracking|transition|duration|ease|object|col|row|order|outline|ring|blur|drop-shadow|backdrop-blur|cursor|select|divide|shrink|grow|size|self|place|content|from|via|to)-[\w[\]/.%#(),-]+$/;

const bareUtility = (token) => token.replace(/^(?:[^\s:[]+:|\[[^\]]*\]:)*/, '').replace(/^!/, '').replace(/!$/, '');

/** `!` la începutul utilitarului, cu sau fără variante în față (`!mt-0`, `md:!p-0`); sufixul `mt-0!` din v4 nu intră. */
export const leadingBang = (token) => token.replace(/^(?:[^\s:[]+:|\[[^\]]*\]:)*/, '').startsWith('!');

/** Clasele din v3 eliminate dintr-un șir de clase: [{ token, motiv }]. */
export function removedClasses(classString) {
  const found = [];
  for (const token of classString.split(/\s+/).filter(Boolean)) {
    const bare = bareUtility(token);
    if (REMOVED.has(bare)) found.push({ token, motiv: `${bare} (eliminat/redenumit în v4)` });
    for (const [re, motiv] of REMOVED_PATTERNS) if (re.test(bare)) found.push({ token, motiv });
  }
  return found;
}

/** Șirurile de clase dintr-un fișier sursă: valorile `class=`/`className=` și literalele care arată a liste de clase. */
export function classStrings(text) {
  const out = [];
  for (const m of text.matchAll(/\bclass(?:Name)?\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) out.push(m[1] ?? m[2]);
  for (const m of text.matchAll(/`([^`]*)`|"([^"\n]*)"|'([^'\n]*)'/g)) {
    const s = m[1] ?? m[2] ?? m[3] ?? '';
    const strong = s.split(/\s+/).filter((t) => STRONG.test(t));
    if (strong.length >= 1 && /\s/.test(s.trim())) out.push(s);
    else if (strong.length === 1 && s.trim() === strong[0]) out.push(s);
  }
  return out;
}

function sourceFiles(dir = SRC) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(p);
    return /\.(astro|tsx|ts|jsx|js|md|mdx|html|css)$/.test(e.name) ? [p] : [];
  });
}

test('clase v3 (detector): prinde clasele eliminate și nu se sperie de cele valide în v4', () => {
  const bad = removedClasses(
    'outline-none rounded shadow blur md:rounded hover:shadow-sm flex-shrink-0 flex-grow bg-gradient-to-t from-black bg-opacity-50 bg-[--x] order-none overflow-ellipsis outline ring focus:outline-none',
  ).map((x) => x.token);
  assert.deepEqual(bad, [
    'outline-none', 'rounded', 'shadow', 'blur', 'md:rounded', 'hover:shadow-sm', 'flex-shrink-0', 'flex-grow', 'bg-gradient-to-t',
    'bg-opacity-50', 'bg-[--x]', 'order-none', 'overflow-ellipsis', 'outline', 'ring', 'focus:outline-none',
  ]);
  assert.deepEqual(['!mt-0', 'md:!p-0', 'hover:!mt-2', 'mt-0!', 'md:mt-0!', 'p-4'].filter(leadingBang), ['!mt-0', 'md:!p-0', 'hover:!mt-2']);
  const good = 'outline-hidden outline-solid outline-2 rounded-sm rounded-md rounded-xs shadow-card shadow-lg shrink-0 grow bg-linear-to-t/srgb bg-white/50 bg-(--x) order-0 text-ellipsis ring-2 focus-visible:outline-solid lg:order-0';
  assert.deepEqual(removedClasses(good), []);
});

test('clase v3: niciuna dintre clasele eliminate sau redenumite nu mai apare în src/', () => {
  const problems = [];
  const roundedSmSeen = new Set();
  for (const file of sourceFiles()) {
    const rel = relative(ROOT, file);
    const text = read(file);
    for (const s of classStrings(text)) {
      for (const { token, motiv } of removedClasses(s)) problems.push(`${rel}: "${token}": ${motiv}`);
      for (const token of s.split(/\s+/)) {
        if (bareUtility(token) === 'rounded-sm') roundedSmSeen.add(rel);
        if (leadingBang(token) && !(LEADING_BANG_FILES.get(rel) ?? []).includes(token)) problems.push(`${rel}: "${token}": `+ '`!` la început (v4: `mt-0!`)');
      }
    }
    // @apply în CSS/<style>: aceleași reguli
    for (const m of text.matchAll(/@apply\s+([^;}]+)[;}]/g)) for (const { token, motiv } of removedClasses(m[1])) problems.push(`${rel}: @apply "${token}": ${motiv}`);
  }
  for (const rel of roundedSmSeen) if (!ROUNDED_SM_FILES.has(rel)) problems.push(`${rel}: "rounded-sm" nou (în v3 era 2px, în v4 e 4px; pentru 2px folosește rounded-xs): adaugă fișierul în ROUNDED_SM_FILES dacă 4px e intenționat`);
  assert.deepEqual([...new Set(problems)], []);
});

test('clase v3: fiecare fișier din ROUNDED_SM_FILES chiar mai are rounded-sm (lista nu rămâne cu intrări moarte)', () => {
  for (const rel of ROUNDED_SM_FILES) {
    const strings = classStrings(read(join(ROOT, rel)));
    assert.ok(strings.some((s) => s.split(/\s+/).includes('rounded-sm')), `${rel} nu mai are rounded-sm: scoate-l din listă`);
  }
});

// Compatibilitate cu preflight-ul v3, păstrată în @layer base (vezi D-2026-11-27-01).
test('global.css: [type=search] cu appearance textfield și outline-offset -2px (preflight v3)', () => {
  const m = noComments(globalCss).match(/\[type=['"]search['"]\]\s*\{([^}]*)\}/);
  assert.ok(m, 'lipsește regula [type=\'search\'] din global.css');
  assert.match(m[1], /(?:^|[\s;])appearance:\s*textfield\b/, 'lipsește appearance: textfield');
  assert.match(m[1], /outline-offset:\s*-2px/, 'lipsește outline-offset: -2px');
});

test('Footer: lista cu elementul `data-consent-item` (ascuns) nu folosește space-y (ar lăsa spațiu în plus în v4)', () => {
  const footer = read(join(SRC, 'components', 'global', 'Footer.astro'));
  const at = footer.indexOf('data-consent-item');
  assert.ok(at !== -1, 'lipsește data-consent-item din Footer.astro');
  const ulStart = footer.lastIndexOf('<ul', at);
  assert.ok(ulStart !== -1, 'elementul data-consent-item nu e într-un <ul>');
  const ulTag = footer.slice(ulStart, footer.indexOf('>', ulStart) + 1);
  assert.doesNotMatch(ulTag, /\bspace-y-/, `ul-ul cu data-consent-item folosește space-y: ${ulTag}`);
  assert.match(ulTag, /\bgap-\d/, `ul-ul cu data-consent-item trebuie să folosească gap: ${ulTag}`);
});
