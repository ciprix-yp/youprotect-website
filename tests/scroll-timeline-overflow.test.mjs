// Animațiile legate de derulare (`animation-timeline: view()`, clasele `sd-*` și `card-3d` din global.css) se leagă de cel
// mai apropiat strămoș cu overflow ≠ visible/clip. Dacă acel strămoș e un `overflow-hidden` (sau auto/scroll), el devine
// containerul de derulare, nu pagina, progresul rămâne blocat la 1 și efectul nu rulează deloc (review design, 25.11.2026,
// măsurat în Chrome și WebKit). Soluția e `overflow-clip`, care taie la fel, dar nu creează container de derulare.
//
// Testul citește paginile generate din dist/ (același model ca tests/poze-actiune.test.mjs: fără dist/ sare, cu
// POZE_REQUIRE_DIST=1 pică) și pică dacă un element cu `sd-*`/`card-3d` are un strămoș cu overflow hidden/auto/scroll
// (clasă Tailwind, orice variantă responsive, `[overflow:…]` sau `style="overflow…"`).
//
// EXCEPȚII documentate: un strămoș cu atributul `data-sd-exceptie="motiv"` nu blochează testul. Azi un singur caz:
// scrollerul orizontal din CategoryTiles (`overflow-x-auto sm:overflow-visible`): pe telefon dalele nu pot rula efectul
// (scrollerul e containerul), de la sm în sus rulează.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist');
const REQUIRE_DIST = process.env.POZE_REQUIRE_DIST === '1';

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr', 'param']);
const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title']);

/** Parser mic de HTML: întoarce pentru fiecare element { tag, attrs, ancestors: [{tag, attrs}] }. Fără regex pe tot documentul. */
export function parseElements(html) {
  const out = [];
  const stack = [];
  const n = html.length;
  let i = 0;
  while (i < n) {
    const lt = html.indexOf('<', i);
    if (lt === -1) break;
    if (html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt + 4);
      i = end === -1 ? n : end + 3;
      continue;
    }
    if (html[lt + 1] === '!' || html[lt + 1] === '?') {
      const end = html.indexOf('>', lt);
      i = end === -1 ? n : end + 1;
      continue;
    }
    if (html[lt + 1] === '/') {
      const end = html.indexOf('>', lt);
      const name = html.slice(lt + 2, end === -1 ? n : end).trim().toLowerCase();
      const at = stack.map((e) => e.tag).lastIndexOf(name);
      if (at !== -1) stack.length = at;
      i = end === -1 ? n : end + 1;
      continue;
    }
    // tag de deschidere
    let j = lt + 1;
    while (j < n && /[A-Za-z0-9:-]/.test(html[j])) j++;
    const tag = html.slice(lt + 1, j).toLowerCase();
    if (!tag) {
      i = lt + 1;
      continue;
    }
    const attrs = {};
    let selfClose = false;
    while (j < n) {
      while (j < n && /\s/.test(html[j])) j++;
      if (html[j] === '>') {
        j++;
        break;
      }
      if (html[j] === '/') {
        selfClose = true;
        j++;
        continue;
      }
      let k = j;
      while (k < n && !/[\s=>/]/.test(html[k])) k++;
      const name = html.slice(j, k).toLowerCase();
      j = k;
      while (j < n && /\s/.test(html[j])) j++;
      let value = '';
      if (html[j] === '=') {
        j++;
        while (j < n && /\s/.test(html[j])) j++;
        const q = html[j];
        if (q === '"' || q === "'") {
          const end = html.indexOf(q, j + 1);
          value = html.slice(j + 1, end === -1 ? n : end);
          j = end === -1 ? n : end + 1;
        } else {
          k = j;
          while (k < n && !/[\s>]/.test(html[k])) k++;
          value = html.slice(j, k);
          j = k;
        }
      }
      if (name) attrs[name] = value;
    }
    out.push({ tag, attrs, ancestors: stack.slice() });
    if (RAW_TEXT.has(tag) && !selfClose) {
      const close = html.toLowerCase().indexOf(`</${tag}`, j);
      const end = close === -1 ? -1 : html.indexOf('>', close);
      i = end === -1 ? n : end + 1;
      continue;
    }
    if (!VOID.has(tag) && !selfClose) stack.push({ tag, attrs });
    i = j;
  }
  return out;
}

const classesOf = (attrs) => (attrs.class ?? '').split(/\s+/).filter(Boolean);

/** Clase de tip `[variante:]overflow[-x|-y]-(hidden|auto|scroll)` sau `[overflow:hidden]`. Orice variantă, conservator. */
const OVERFLOW_CLASS = /^(?:[^:\s]+:)*(?:overflow(?:-[xy])?-(?:hidden|auto|scroll)|\[overflow(?:-[xy])?:(?:hidden|auto|scroll)\])$/;
const OVERFLOW_STYLE = /(?:^|;)\s*overflow(?:-[xy])?\s*:\s*(?:hidden|auto|scroll)/i;
/** Elemente cu animație legată de derulare; copiii pseudo (`::before`, `> svg`, `> *`) pornesc de la elementul însuși. */
const SD_CLASS = /^(?:[^:\s]+:)*(?:sd-[a-z-]+|card-3d)$/;
const SD_SELF_SCOPE = new Set(['sd-hero-content', 'sd-step', 'sd-check']);
// `sd-hero-media` folosește scroll(root), nu view(): nu depinde de strămoși, dar rămâne în regulă (clip) ca să nu se strice la o schimbare.

/** Explică de ce un element ar bloca; null dacă nu blochează sau are exceptie documentată. */
export function blocker(attrs) {
  if ('data-sd-exceptie' in attrs) return null;
  const cls = classesOf(attrs).find((c) => OVERFLOW_CLASS.test(c));
  if (cls) return cls;
  if (attrs.style && OVERFLOW_STYLE.test(attrs.style)) return `style="${attrs.style}"`;
  return null;
}

const describe = (e) => `${e.tag}${e.attrs.class ? `.${classesOf(e.attrs).slice(0, 4).join('.')}` : ''}`;

/** Probleme dintr-un document HTML: [{ element, blockedBy }]. */
export function findBlockedScrollEffects(html) {
  const problems = [];
  for (const el of parseElements(html)) {
    const sd = classesOf(el.attrs).filter((c) => SD_CLASS.test(c));
    if (sd.length === 0) continue;
    const chain = sd.some((c) => SD_SELF_SCOPE.has(c.replace(/^(?:[^:\s]+:)*/, ''))) ? [...el.ancestors, el] : el.ancestors;
    for (const a of chain) {
      const why = blocker(a.attrs);
      if (why) problems.push({ element: `${describe(el)} [${sd.join(' ')}]`, blockedBy: `${describe(a)} (${why})` });
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------------------------------------------
// Teste negative pe HTML sintetic

const wrap = (outerAttrs, inner = '<img class="sd-media">') => `<!doctype html><html><body><div ${outerAttrs}>${inner}</div></body></html>`;

test('sintetic: overflow-hidden pe strămoș pică', () => {
  assert.equal(findBlockedScrollEffects(wrap('class="relative overflow-hidden rounded-xl"')).length, 1);
});
test('sintetic: overflow-clip trece', () => {
  assert.deepEqual(findBlockedScrollEffects(wrap('class="relative overflow-clip rounded-xl"')), []);
});
test('sintetic: varianta responsive sm:overflow-hidden pică', () => {
  assert.equal(findBlockedScrollEffects(wrap('class="sm:overflow-hidden"')).length, 1);
  assert.equal(findBlockedScrollEffects(wrap('class="md:hover:overflow-y-auto"')).length, 1);
  assert.equal(findBlockedScrollEffects(wrap('class="overflow-x-scroll"')).length, 1);
});
test('sintetic: sm:overflow-visible și overflow-clip nu pică', () => {
  assert.deepEqual(findBlockedScrollEffects(wrap('class="sm:overflow-visible overflow-clip"')), []);
});
test('sintetic: style overflow și [overflow:hidden] pică', () => {
  assert.equal(findBlockedScrollEffects(wrap('style="width:100%;overflow:scroll"')).length, 1);
  assert.equal(findBlockedScrollEffects(wrap('class="[overflow:hidden]"')).length, 1);
});
test('sintetic: atribut fără ghilimele (HTML comprimat) e citit', () => {
  assert.equal(findBlockedScrollEffects('<div class=overflow-hidden><img class=sd-media></div>').length, 1);
});
test('sintetic: excepția documentată (data-sd-exceptie) trece', () => {
  const html = wrap('class="overflow-x-auto sm:overflow-visible" data-sd-exceptie="scroller orizontal pe telefon"', '<a class="card-3d"></a>');
  assert.deepEqual(findBlockedScrollEffects(html), []);
  assert.equal(findBlockedScrollEffects(wrap('class="overflow-x-auto"', '<a class="card-3d"></a>')).length, 1);
});
test('sintetic: overflow pe elementul însuși nu-l blochează, dar pe copiii sd-hero-content da', () => {
  assert.deepEqual(findBlockedScrollEffects('<div class="sd-media overflow-hidden"></div>'), []);
  assert.equal(findBlockedScrollEffects('<div class="sd-hero-content overflow-hidden"><p>x</p></div>').length, 1);
});
test('sintetic: void elements, comentarii, script și style nu strică stiva', () => {
  const html = `<div class="overflow-hidden"><!-- <div class="x"> --><br><script>var a="<div class='sd-media'>"</script><style>.a{}</style></div><p class="sd-media"></p>`;
  assert.deepEqual(findBlockedScrollEffects(html), []);
  assert.equal(findBlockedScrollEffects('<div class="overflow-hidden"><br><img><p class="sd-rise"></p></div>').length, 1);
});
test('sintetic: strămoșul închis nu mai blochează frații', () => {
  assert.deepEqual(findBlockedScrollEffects('<div class="overflow-hidden"><span>a</span></div><div><img class="sd-media"></div>'), []);
});

// ---------------------------------------------------------------------------------------------------------------
// Paginile reale din dist/

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.html')) out.push(p);
  }
  return out;
}

test('dist: niciun efect sd-*/card-3d nu e blocat de un strămoș cu overflow hidden/auto/scroll', (t) => {
  if (!(existsSync(DIST) && statSync(DIST).isDirectory())) {
    if (REQUIRE_DIST) assert.fail('POZE_REQUIRE_DIST=1, dar dist/ lipsește: rulează `npm run build`');
    t.skip('dist/ lipsește: rulează `npm run build` și apoi testul din nou');
    return;
  }
  const files = walk(DIST);
  assert.ok(files.length > 50, `prea puține pagini în dist/ (${files.length})`);
  const report = [];
  let withEffects = 0;
  for (const f of files) {
    const html = readFileSync(f, 'utf8');
    if (/\b(?:sd-[a-z-]+|card-3d)\b/.test(html)) withEffects++;
    for (const p of findBlockedScrollEffects(html)) report.push(`${f.slice(DIST.length)}: ${p.element} blocat de ${p.blockedBy}`);
  }
  assert.ok(withEffects >= 5, `prea puține pagini cu efecte sd-* (${withEffects}): parserul sau clasele s-au stricat`);
  assert.deepEqual(report, [], `Efecte legate de derulare blocate (folosește overflow-clip în loc de overflow-hidden):\n${report.join('\n')}`);
});
