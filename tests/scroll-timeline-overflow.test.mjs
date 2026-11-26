// Animațiile legate de derulare (`animation-timeline: view()`, clasele `sd-*` și `card-3d` din global.css) se leagă de cel
// mai apropiat strămoș cu overflow ≠ visible/clip. Dacă acel strămoș e un `overflow-hidden` (sau auto/scroll), el devine
// containerul de derulare, nu pagina, progresul rămâne blocat la 1 și efectul nu rulează deloc (review design, 25.11.2026,
// măsurat în Chrome și WebKit). Soluția e `overflow-clip`, care taie la fel, dar nu creează container de derulare.
//
// Testul citește paginile generate din dist/ (același model ca tests/poze-actiune.test.mjs: fără dist/ sare, cu
// POZE_REQUIRE_DIST=1 pică) și pică dacă un element cu `sd-*`/`card-3d` are un strămoș cu overflow hidden/auto/scroll
// (clasă Tailwind, orice variantă responsive, `[overflow:…]` sau `style="overflow…"`). Setul de clase care blochează se ia
// din două surse, unite: (1) regexul pe numele Tailwind, (2) CSS-ul compilat din dist/_astro/*.css: orice regulă care
// declară overflow/overflow-x/overflow-y cu hidden, auto sau scroll (inclusiv `truncate`, `line-clamp-*`, `sr-only`, variantele
// responsive/stări; media query-urile se aplatizează, conservator: o clasă care blochează doar de la un breakpoint e blocantă).
// `overflow: clip`, `overflow-x: clip` și `overflow: visible` nu blochează.
//
// LIMITE ale parserului CSS (blockingCssRules): (1) selectorii cu context sau combinatori (`.a .b`, `.a>.b` etc.) și variantele
// arbitrare Tailwind de tip `[&>div]:overflow-hidden` se tratează conservator: contează doar subiectul selectorului (ultimul
// compus), iar contextul se ignoră, deci elementul cu acea clasă e considerat blocant oriunde apare (pot apărea alarme false, dar nu
// se pierd cazuri); (2) un `:is(...)` fără o clasă sau etichetă în afara lui (de ex. `:is(.a,.b){overflow:hidden}`) NU e detectat:
// grupul se sare, iar regula rămâne fără clase și fără etichetă, deci nu intră în set.
//
// EXCEPȚII documentate: un strămoș cu atributul `data-sd-exceptie="motiv"` nu blochează testul. Azi un singur caz:
// scrollerul orizontal din CategoryTiles (`overflow-x-auto sm:overflow-visible`): pe telefon dalele nu pot rula efectul
// (scrollerul e containerul), de la sm în sus rulează. Excepțiile se numără PE ELEMENT: cel mult una pe pagină, doar pe
// paginile din ALLOWED_EXCEPTION_PAGES și doar pe elementul scrollerului (vezi isExpectedExceptionElement).
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
// `!` (important Tailwind) în față sau la sfârșit (`!overflow-hidden`, `overflow-hidden!`), cu sau fără variante.
const OVERFLOW_CLASS = /^(?:[^:\s]+:)*!?(?:overflow(?:-[xy])?-(?:hidden|auto|scroll)|\[overflow(?:-[xy])?:(?:hidden|auto|scroll)\])!?$/;
// Și forma cu două valori (`overflow: clip hidden`): oricare dintre valori blochează.
const OVERFLOW_STYLE = /(?:^|;)\s*overflow(?:-[xy])?\s*:\s*(?:\S+\s+)?(?:hidden|auto|scroll)/i;
/** Elemente cu animație legată de derulare; copiii pseudo (`::before`, `> svg`, `> *`) pornesc de la elementul însuși. */
const SD_CLASS = /^(?:[^:\s]+:)*(?:sd-[a-z-]+|card-3d)$/;
const SD_SELF_SCOPE = new Set(['sd-hero-content', 'sd-step', 'sd-check']);
// `sd-hero-media` folosește scroll(root), nu view(): nu depinde de strămoși, dar rămâne în regulă (clip) ca să nu se strice la o schimbare.

// --- Reguli blocante din CSS-ul compilat ------------------------------------------------------------------------------

// Valoare de overflow care creează container de derulare. `clip` și `visible` nu (nici `overflow: clip visible`).
const BLOCKING_VALUE = /(?:^|\s)(?:hidden|auto|scroll)(?=\s|$)/i;
const OVERFLOW_DECL = /(?:^|[;{\s])overflow(?:-[xy])?\s*:\s*([^;}]*)/gi;
const SKIPPED_AT_RULES = /^@(?:keyframes|-webkit-keyframes|font-face|property|page|counter-style|font-feature-values)\b/i;

/** Clasa dintr-un selector CSS, cu escape-uri (`\:`, `\/`, `\31 0`) decodate; întoarce [nume, poziția de după]. */
function readIdent(sel, i) {
  let out = '';
  while (i < sel.length) {
    const c = sel[i];
    if (c === '\\') {
      const hex = /^[0-9a-fA-F]{1,6}\s?/.exec(sel.slice(i + 1));
      if (hex) {
        out += String.fromCodePoint(parseInt(hex[0], 16));
        i += 1 + hex[0].length;
      } else {
        out += sel[i + 1] ?? '';
        i += 2;
      }
    } else if (/[\w-]/.test(c) || c.charCodeAt(0) > 127) {
      out += c;
      i++;
    } else break;
  }
  return [out, i];
}

/** Sare peste un grup între paranteze/croșete începând la `i` (care e '(' sau '['); întoarce poziția de după. */
function skipGroup(sel, i) {
  const open = sel[i];
  const close = open === '(' ? ')' : ']';
  let depth = 0;
  for (; i < sel.length; i++) {
    if (sel[i] === '\\') i++;
    else if (sel[i] === open) depth++;
    else if (sel[i] === close && --depth === 0) return i + 1;
  }
  return sel.length;
}

/** Compusul-subiect (ultimul) al unui selector simplu: { classes, tag } sau null dacă țintește un pseudo-element. */
export function subjectOf(selector) {
  const sel = selector.trim();
  let cur = { classes: [], tag: null, pseudoElement: false, empty: true };
  let i = 0;
  while (i < sel.length) {
    const c = sel[i];
    if (/\s/.test(c) || c === '>' || c === '+' || c === '~') {
      if (!cur.empty) cur = { classes: [], tag: null, pseudoElement: false, empty: true };
      i++;
    } else if (c === '.') {
      const [name, next] = readIdent(sel, i + 1);
      cur.classes.push(name);
      cur.empty = false;
      i = next;
    } else if (c === ':') {
      const pseudoElement = sel[i + 1] === ':';
      const [name, next] = readIdent(sel, i + (pseudoElement ? 2 : 1));
      if (pseudoElement || /^(?:before|after|first-line|first-letter|marker|placeholder|selection|backdrop)$/i.test(name)) cur.pseudoElement = true;
      i = sel[next] === '(' ? skipGroup(sel, next) : next;
      cur.empty = false;
    } else if (c === '[') {
      i = skipGroup(sel, i);
      cur.empty = false;
    } else if (c === '#') {
      i = readIdent(sel, i + 1)[1];
      cur.empty = false;
    } else if (c === '*' || /[A-Za-z]/.test(c)) {
      if (c === '*') i++;
      else {
        const [name, next] = readIdent(sel, i);
        cur.tag = name.toLowerCase();
        i = next;
      }
      if (c === '*') cur.tag = '*';
      cur.empty = false;
    } else i++; // `&`, `|` etc.
  }
  return cur.pseudoElement ? null : { classes: cur.classes, tag: cur.tag };
}

/** Împarte o listă de selectori la virgulele din afara parantezelor. */
function splitSelectors(prelude) {
  const out = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < prelude.length; i++) {
    const c = prelude[i];
    if (c === '\\') i++;
    else if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (c === ',' && depth === 0) {
      out.push(prelude.slice(start, i));
      start = i + 1;
    }
  }
  out.push(prelude.slice(start));
  return out.filter((s) => s.trim());
}

/**
 * Regulile din CSS care declară overflow blocant: [{ selector, classes, tag }] (subiectul selectorului, adică elementul
 * care primește overflow-ul). At-rule-urile cu conținut (@media, @supports, @layer, @container) sunt aplatizate: conservator.
 */
export function blockingCssRules(css) {
  const rules = [];
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const walk = (src) => {
    let i = 0;
    while (i < src.length) {
      const open = src.indexOf('{', i);
      if (open === -1) break;
      const prelude = src.slice(i, open).trim();
      let depth = 0;
      let end = open;
      for (; end < src.length; end++) {
        const c = src[end];
        if (c === '"' || c === "'") end = src.indexOf(c, end + 1) === -1 ? src.length : src.indexOf(c, end + 1);
        else if (c === '\\') end++;
        else if (c === '{') depth++;
        else if (c === '}' && --depth === 0) break;
      }
      const body = src.slice(open + 1, end);
      i = end + 1;
      if (prelude.startsWith('@')) {
        if (!SKIPPED_AT_RULES.test(prelude) && body.includes('{')) walk(body);
        continue;
      }
      let blocks = false;
      for (const m of body.matchAll(OVERFLOW_DECL)) if (BLOCKING_VALUE.test(m[1].replace(/!important/i, ''))) blocks = true;
      if (!blocks) continue;
      for (const selector of splitSelectors(prelude)) {
        const subject = subjectOf(selector);
        if (subject) rules.push({ selector: selector.trim(), ...subject });
      }
    }
  };
  walk(text);
  return rules;
}

/** Regula din CSS care face ca elementul să blocheze (toate clasele subiectului prezente; eticheta, dacă e dată, se potrivește). */
function cssBlocker(el, cssRules) {
  const have = new Set(classesOf(el.attrs));
  for (const r of cssRules) {
    if (r.classes.length === 0 && (r.tag === null || r.tag === '*')) continue; // `*`/gol: nu ghicim, ar bloca orice
    if (r.classes.every((c) => have.has(c)) && (r.tag === null || r.tag === '*' || r.tag === el.tag)) return r.selector;
  }
  return null;
}

/** Explică de ce un element ar bloca; null dacă nu blochează sau are exceptie documentată. `el` = { tag, attrs }. */
export function blocker(el, cssRules = []) {
  const { attrs } = el;
  if ((attrs['data-sd-exceptie'] ?? '').trim() !== '') return null; // excepția cere un motiv nevid
  const cls = classesOf(attrs).find((c) => OVERFLOW_CLASS.test(c));
  if (cls) return cls;
  if (attrs.style && OVERFLOW_STYLE.test(attrs.style)) return `style="${attrs.style}"`;
  const css = cssBlocker(el, cssRules);
  if (css) return `CSS ${css}`;
  return null;
}

/** Elementele cu atributul `data-sd-exceptie` dintr-un document (și cele goale), unul câte unul. */
export function exceptionElements(html) {
  return parseElements(html).filter((e) => 'data-sd-exceptie' in e.attrs);
}
/** Motivele `data-sd-exceptie` dintr-un document (inclusiv cele goale, ca ''), pentru lista permisă explicit. */
export function exceptionReasons(html) {
  return exceptionElements(html).map((e) => e.attrs['data-sd-exceptie'].trim());
}
/** Singurele excepții permise. O excepție nouă cere schimbarea acestei liste, deliberat. */
const ALLOWED_EXCEPTIONS = ['scroller orizontal pe telefon'];
/** Paginile unde apare CategoryTiles (excepția e a componentei, cel mult un element pe pagină). */
const ALLOWED_EXCEPTION_PAGES = ['/index.html', '/produse/index.html'];
/** Elementul-excepție așteptat: scrollerul din CategoryTiles (`overflow-x-auto sm:overflow-visible`, motiv din lista permisă). */
export function isExpectedExceptionElement(el) {
  const cls = classesOf(el.attrs);
  return el.tag === 'div' && cls.includes('overflow-x-auto') && cls.includes('sm:overflow-visible') && ALLOWED_EXCEPTIONS.includes(el.attrs['data-sd-exceptie'].trim());
}
/** Probleme de excepții într-o pagină: mai mult de una, sau una care nu e scrollerul așteptat. */
export function exceptionProblems(html) {
  const found = exceptionElements(html);
  const problems = [];
  if (found.length > 1) problems.push(`${found.length} elemente cu data-sd-exceptie (maximum 1 pe pagină)`);
  for (const e of found) if (!isExpectedExceptionElement(e)) problems.push(`data-sd-exceptie pe ${e.tag}${e.attrs.class ? `.${classesOf(e.attrs).slice(0, 4).join('.')}` : ''} (motiv ${JSON.stringify(e.attrs['data-sd-exceptie'].trim())}), nu pe scrollerul din CategoryTiles`);
  return problems;
}

const describe = (e) => `${e.tag}${e.attrs.class ? `.${classesOf(e.attrs).slice(0, 4).join('.')}` : ''}`;

/** Probleme dintr-un document HTML: [{ element, blockedBy }]. */
export function findBlockedScrollEffects(html, cssRules = []) {
  const problems = [];
  for (const el of parseElements(html)) {
    const sd = classesOf(el.attrs).filter((c) => SD_CLASS.test(c));
    if (sd.length === 0) continue;
    const chain = sd.some((c) => SD_SELF_SCOPE.has(c.replace(/^(?:[^:\s]+:)*/, ''))) ? [...el.ancestors, el] : el.ancestors;
    for (const a of chain) {
      const why = blocker(a, cssRules);
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
test('sintetic: excepția goală sau doar spații nu trece', () => {
  assert.equal(findBlockedScrollEffects(wrap('class="overflow-hidden" data-sd-exceptie=""')).length, 1);
  assert.equal(findBlockedScrollEffects(wrap('class="overflow-hidden" data-sd-exceptie="  "')).length, 1);
  assert.equal(findBlockedScrollEffects(wrap('class="overflow-hidden" data-sd-exceptie')).length, 1);
  assert.deepEqual(exceptionReasons(wrap('data-sd-exceptie="" ', '<p data-sd-exceptie="a"></p>')), ['', 'a']);
});
test('sintetic: !overflow-hidden (important Tailwind) pică, cu variante și la sfârșit', () => {
  assert.equal(findBlockedScrollEffects(wrap('class="!overflow-hidden"')).length, 1);
  assert.equal(findBlockedScrollEffects(wrap('class="sm:!overflow-auto"')).length, 1);
  assert.equal(findBlockedScrollEffects(wrap('class="overflow-y-scroll!"')).length, 1);
  assert.equal(findBlockedScrollEffects(wrap('class="!overflow-clip"')).length, 0);
});
test('sintetic: overflow cu două valori în style (clip hidden) pică', () => {
  assert.equal(findBlockedScrollEffects(wrap('style="overflow: clip hidden"')).length, 1);
  assert.equal(findBlockedScrollEffects(wrap('style="overflow:hidden clip"')).length, 1);
  assert.equal(findBlockedScrollEffects(wrap('style="overflow-x: clip auto"')).length, 1);
  assert.equal(findBlockedScrollEffects(wrap('style="overflow:hidden !important"')).length, 1);
  assert.deepEqual(findBlockedScrollEffects(wrap('style="overflow: clip clip"')), []);
  assert.deepEqual(findBlockedScrollEffects(wrap('style="overflow: visible"')), []);
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

// CSS minificat sintetic, ca în dist/_astro/*.css (selectori escapați, media query-uri, clip/visible).
const SYNTH_CSS = [
  '.card-clip{overflow:clip}.vis{overflow:visible}.xclip{overflow-x:clip}.two{overflow:clip visible}',
  '.scrim-box{position:relative;overflow:hidden}',
  '.truncate{text-overflow:ellipsis;white-space:nowrap;overflow:hidden}',
  '.line-clamp-2{-webkit-line-clamp:2;-webkit-box-orient:vertical;display:-webkit-box;overflow:hidden}',
  '@media (min-width:768px){.md\\:custom-scroll{overflow-y:scroll}.md\\:w-1\\/2{width:50%}}',
  '.hov\\:peek:hover{overflow-x:auto!important}',
  '.deco::before{overflow:hidden}',
  '@keyframes spin{from{overflow:hidden}to{overflow:hidden}}',
  'html,body{overflow-x:clip}',
].join('');
const synthRules = blockingCssRules(SYNTH_CSS);
const selectorsOf = (rules) => rules.map((r) => r.selector).sort();

test('sintetic CSS: se iau doar regulile cu overflow hidden/auto/scroll (clip, visible, pseudo-elemente, keyframes nu)', () => {
  assert.deepEqual(selectorsOf(synthRules), ['.hov\\:peek:hover', '.line-clamp-2', '.md\\:custom-scroll', '.scrim-box', '.truncate']);
  assert.deepEqual(synthRules.find((r) => r.selector === '.md\\:custom-scroll').classes, ['md:custom-scroll']);
});
test('sintetic CSS: o clasă blocantă doar în CSS (nu după numele Tailwind) e prinsă; clip/visible nu', () => {
  assert.equal(findBlockedScrollEffects(wrap('class="scrim-box"'), synthRules).length, 1);
  assert.equal(findBlockedScrollEffects(wrap('class="md:custom-scroll"'), synthRules).length, 1);
  assert.equal(findBlockedScrollEffects(wrap('class="hov:peek"'), synthRules).length, 1);
  assert.equal(findBlockedScrollEffects(wrap('class="scrim-box"')).length, 0, 'fără CSS, numele nu spune nimic: regexul pe nume nu îl vede');
  for (const c of ['card-clip', 'vis', 'xclip', 'two', 'md:w-1/2', 'deco']) {
    assert.deepEqual(findBlockedScrollEffects(wrap(`class="${c}"`), synthRules), [], c);
  }
});
test('sintetic CSS: truncate și line-clamp-2 pe strămoș pică', () => {
  assert.equal(findBlockedScrollEffects(wrap('class="truncate"'), synthRules).length, 1);
  assert.equal(findBlockedScrollEffects(wrap('class="line-clamp-2"'), synthRules).length, 1);
  assert.equal(findBlockedScrollEffects(wrap('class="mt-2 line-clamp-2 text-sm"'), synthRules).length, 1);
});
test('sintetic CSS: overflow-clip pe strămoș nu pică (nici cu regulile din CSS)', () => {
  assert.deepEqual(findBlockedScrollEffects(wrap('class="relative overflow-clip rounded-xl"'), synthRules), []);
  assert.deepEqual(findBlockedScrollEffects(wrap('class="overflow-clip"'), blockingCssRules('.overflow-clip{overflow:clip}')), []);
});
test('sintetic CSS: selector compus cere toate clasele; eticheta se potrivește; fără ancestori ghicim conservator', () => {
  const rules = blockingCssRules('.a.b{overflow:hidden}.card .inner{overflow:auto}textarea{overflow:auto}');
  assert.equal(findBlockedScrollEffects(wrap('class="a"'), rules).length, 0);
  assert.equal(findBlockedScrollEffects(wrap('class="a b"'), rules).length, 1);
  assert.equal(findBlockedScrollEffects(wrap('class="inner"'), rules).length, 1);
  assert.equal(findBlockedScrollEffects('<details class="x"><img class="sd-media"></details>', blockingCssRules('details{overflow:hidden}')).length, 1);
});
test('sintetic CSS: excepția documentată trece și cu regulile din CSS', () => {
  const html = wrap('class="scrim-box" data-sd-exceptie="scroller orizontal pe telefon"', '<a class="card-3d"></a>');
  assert.deepEqual(findBlockedScrollEffects(html, synthRules), []);
});
test('sintetic excepții: două pe aceeași pagină pică; una singură, pe scrollerul așteptat, trece', () => {
  const tile = '<div class="overflow-x-auto sm:overflow-visible" data-sd-exceptie="scroller orizontal pe telefon"></div>';
  assert.deepEqual(exceptionProblems(`<main>${tile}</main>`), []);
  assert.equal(exceptionProblems(`<main>${tile}${tile}</main>`).length, 1);
  assert.match(exceptionProblems(`<main>${tile}${tile}</main>`)[0], /2 elemente/);
});
test('sintetic excepții: excepția pe alt element sau cu alt motiv pică', () => {
  assert.equal(exceptionProblems('<div class="overflow-hidden" data-sd-exceptie="scroller orizontal pe telefon"></div>').length, 1);
  assert.equal(exceptionProblems('<div class="overflow-x-auto sm:overflow-visible" data-sd-exceptie="alt motiv"></div>').length, 1);
  assert.equal(exceptionProblems('<section class="overflow-x-auto sm:overflow-visible" data-sd-exceptie="scroller orizontal pe telefon"></section>').length, 1);
  assert.deepEqual(exceptionProblems('<div class="x"></div>'), []);
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
  const cssDir = join(DIST, '_astro');
  const cssFiles = existsSync(cssDir) ? readdirSync(cssDir).filter((n) => n.endsWith('.css')) : [];
  assert.ok(cssFiles.length >= 1, 'dist/_astro/*.css lipsește: regulile blocante din CSS nu pot fi citite');
  const cssRules = cssFiles.flatMap((n) => blockingCssRules(readFileSync(join(cssDir, n), 'utf8')));
  // plasă: CSS-ul compilat trebuie să conțină măcar regula `.overflow-hidden` (parserul sau build-ul nu s-au stricat). Nu mai cerem
  // `.line-clamp-2`/`.overflow-x-auto`: Tailwind le scoate din CSS dacă nicio pagină nu le mai folosește, iar asta nu e o defecțiune.
  const known = new Set(cssRules.map((r) => r.selector));
  assert.ok(known.has('.overflow-hidden'), 'regula .overflow-hidden nu a fost găsită în CSS-ul din dist/_astro');
  const report = [];
  const exceptionReport = [];
  const reasons = new Set();
  const pagesWithException = [];
  let withEffects = 0;
  for (const f of files) {
    const html = readFileSync(f, 'utf8');
    const page = f.slice(DIST.length);
    if (/\b(?:sd-[a-z-]+|card-3d)\b/.test(html)) withEffects++;
    for (const r of exceptionReasons(html)) reasons.add(r);
    if (exceptionElements(html).length > 0) pagesWithException.push(page);
    for (const p of exceptionProblems(html)) exceptionReport.push(`${page}: ${p}`);
    for (const p of findBlockedScrollEffects(html, cssRules)) report.push(`${page}: ${p.element} blocat de ${p.blockedBy}`);
  }
  assert.ok(withEffects >= 5, `prea puține pagini cu efecte sd-* (${withEffects}): parserul sau clasele s-au stricat`);
  assert.deepEqual([...reasons].sort(), ALLOWED_EXCEPTIONS, 'data-sd-exceptie: mulțimea motivelor folosite diferă de lista permisă (ALLOWED_EXCEPTIONS)');
  assert.deepEqual(exceptionReport, [], `data-sd-exceptie: cel mult un element pe pagină, doar scrollerul din CategoryTiles:\n${exceptionReport.join('\n')}`);
  assert.deepEqual(pagesWithException.sort(), ALLOWED_EXCEPTION_PAGES, 'data-sd-exceptie: paginile cu excepție diferă de ALLOWED_EXCEPTION_PAGES');
  assert.deepEqual(report, [], `Efecte legate de derulare blocate (folosește overflow-clip în loc de overflow-hidden):\n${report.join('\n')}`);
});
