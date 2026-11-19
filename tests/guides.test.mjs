// Ghidurile de la /ghiduri/: fiecare are pagina lui, texte care încap în Google, surse afișate pentru orice legătură
// externă, nicio cifră de preț și nicio afirmație pe care nu o putem dovedi (D-2026-11-19-03).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GUIDES, footwearClass, formatGuideDate, guideHref, hiVisClass } from '../src/lib/guides.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const pagePath = (g) => join(ROOT, 'src/pages/ghiduri', `${g.slug}.astro`);
const read = (p) => readFileSync(p, 'utf8');
const guideFiles = [
  ...GUIDES.map(pagePath),
  join(ROOT, 'src/pages/ghiduri/index.astro'),
  join(ROOT, 'src/components/guides/GuideLayout.astro'),
  join(ROOT, 'src/lib/guides.ts'),
];
// Comentariile explică regulile (de ex. „fără prețuri”); verificăm doar textul și codul.
const withoutComments = (src) =>
  src
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');

test('ghiduri: slug-uri unice, fără diacritice, fiecare cu pagina lui', () => {
  const slugs = GUIDES.map((g) => g.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  for (const g of GUIDES) {
    assert.match(g.slug, /^[a-z0-9]+(-[a-z0-9]+)*$/);
    assert.ok(existsSync(pagePath(g)), `${g.slug}: lipsește src/pages/ghiduri/${g.slug}.astro`);
    assert.equal(guideHref(g), `/ghiduri/${g.slug}/`);
    assert.match(read(pagePath(g)), new RegExp(`guideBySlug\\('${g.slug}'\\)`), `${g.slug}: pagina nu-și citește datele din guides.ts`);
  }
});

test('ghiduri: titlul și descrierea încap în rezultatele Google', () => {
  for (const g of GUIDES) {
    assert.ok([...`${g.title} | You Protect`].length <= 64, `${g.slug}: titlu prea lung`);
    const d = [...g.description].length;
    assert.ok(d >= 70 && d <= 160, `${g.slug}: descriere de ${d} caractere`);
  }
  const hub = read(join(ROOT, 'src/pages/ghiduri/index.astro'));
  const title = hub.match(/title="([^"]+)"/)[1];
  const description = hub.match(/description="([^"]+)"/)[1];
  assert.ok([...`${title} | You Protect`].length <= 64, 'pagina /ghiduri/: titlu prea lung');
  assert.ok([...description].length >= 70 && [...description].length <= 160, 'pagina /ghiduri/: descriere');
});

test('ghiduri: surse https, date valide, fiecare legătură externă e și în lista de surse', () => {
  for (const g of GUIDES) {
    assert.ok(g.sources.length > 0, `${g.slug}: fără surse`);
    for (const s of g.sources) assert.equal(new URL(s.url).protocol, 'https:', `${g.slug}: ${s.url}`);
    assert.equal(new Set(g.sources.map((s) => s.url)).size, g.sources.length, `${g.slug}: surse duplicate`);
    for (const d of [g.published, g.updated]) assert.match(d, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(g.updated >= g.published, `${g.slug}: actualizat înainte de publicare`);
    const external = [...read(pagePath(g)).matchAll(/href="(https:\/\/[^"]+)"/g)].map((m) => m[1]);
    const hg = read(pagePath(g)).match(/const HG_1048 = '([^']+)'/)?.[1];
    for (const url of [...external, ...(hg ? [hg] : [])]) {
      assert.ok(g.sources.some((s) => s.url === url), `${g.slug}: ${url} nu e în surse`);
    }
  }
});

test('ghiduri: fără prețuri, fără statut nedovedit, vocea „tu”, diacritice corecte', () => {
  for (const file of guideFiles) {
    const src = withoutComments(read(file));
    assert.doesNotMatch(src, /\d[\d.,\s]*(lei|ron|euro?)\b|\d\s*€/i, `${file}: preț în text`);
    assert.doesNotMatch(src, /autorizat|oficial|exclusiv|singurul|lider|nr\.\s?1(?![.\d])|cel mai bun/i, file);
    assert.doesNotMatch(src, /dumneavoastr|(^|\s)vă(\s|$)|cereți|aveți/im, `${file}: altă voce decât „tu”`);
    assert.doesNotMatch(src, /[şţŞŢ]/, `${file}: ş/ţ cu sedilă`);
    assert.doesNotMatch(src, /\d (mm|J|m²)(?![\p{L}])/u, `${file}: spațiu obișnuit între număr și unitate`);
  }
});

test('ghiduri: clasele se citesc corect din codurile de pe fișe', () => {
  assert.equal(footwearClass([{ code: 'S3S' }, { code: 'SR' }]), 'S3S');
  assert.equal(footwearClass([{ code: 'EN ISO 20345:2022 S7S FO SR' }]), 'S7S');
  assert.equal(footwearClass([{ code: 'EN ISO 20345:2022 S1PL' }]), 'S1PL');
  assert.equal(footwearClass([{ code: 'EN ISO 20345:2022' }, { code: 'FO' }]), null);
  assert.equal(hiVisClass([{ code: 'OEKO-TEX® STANDARD 100' }, { code: 'EN ISO 20471, clasa 3' }]), 3);
  assert.equal(hiVisClass([{ code: 'EN 343 4-4-X' }]), null);
  assert.equal(formatGuideDate('2026-11-19'), '19 noiembrie 2026');
});
