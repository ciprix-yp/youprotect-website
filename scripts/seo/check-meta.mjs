#!/usr/bin/env node
// Verifică titlurile și descrierile din build (dist/), pe HTML-ul final, cu sufixul „| You Protect” inclus.
// Rulează în CI după `npm run build`; iese cu cod 1 dacă o pagină indexabilă iese din limite.
//   node scripts/seo/check-meta.mjs [dist]
// Limitele: titlul complet cel mult 64 de caractere (cât arată Google pe desktop înainte să taie), descrierea între
// 70 și 160, fără titluri sau descrieri duplicate. Paginile cu noindex nu contează.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const TITLE_MAX = 64;
export const DESCRIPTION_MIN = 70;
export const DESCRIPTION_MAX = 160;

const ENTITIES = { '&amp;': '&', '&quot;': '"', '&#39;': "'", '&#x27;': "'", '&lt;': '<', '&gt;': '>' };
const decode = (s) => s.replace(/&(amp|quot|#39|#x27|lt|gt);/g, (m) => ENTITIES[m]);
const length = (s) => [...s].length;

/** Titlul și descrierea unei pagini, sau null dacă pagina are noindex. */
export function readMeta(html) {
  if (/<meta\s+name="robots"\s+content="[^"]*noindex/i.test(html)) return null;
  const title = html.match(/<title>([^<]*)<\/title>/i)?.[1];
  const description = html.match(/<meta\s+name="description"\s+content="([^"]*)"/i)?.[1];
  return { title: title === undefined ? null : decode(title), description: description === undefined ? null : decode(description) };
}

/** Problemele pentru o listă de pagini { url, title, description }. */
export function auditMeta(pages) {
  const problems = [];
  const seen = { title: new Map(), description: new Map() };
  for (const p of pages) {
    if (!p.title) problems.push(`${p.url}: lipsește titlul`);
    else if (length(p.title) > TITLE_MAX) problems.push(`${p.url}: titlul are ${length(p.title)} caractere (max ${TITLE_MAX}): ${p.title}`);
    if (!p.description) problems.push(`${p.url}: lipsește descrierea`);
    else if (length(p.description) < DESCRIPTION_MIN || length(p.description) > DESCRIPTION_MAX)
      problems.push(`${p.url}: descrierea are ${length(p.description)} caractere (${DESCRIPTION_MIN}–${DESCRIPTION_MAX})`);
    for (const key of ['title', 'description']) {
      if (!p[key]) continue;
      const other = seen[key].get(p[key]);
      if (other) problems.push(`${p.url}: ${key === 'title' ? 'titlul' : 'descrierea'} e la fel ca pe ${other}`);
      else seen[key].set(p[key], p.url);
    }
  }
  return problems;
}

function htmlFiles(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? htmlFiles(path.join(dir, e.name)) : e.name.endsWith('.html') ? [path.join(dir, e.name)] : []));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = path.resolve(process.argv[2] ?? 'dist');
  const pages = htmlFiles(root)
    .sort()
    .flatMap((file) => {
      const meta = readMeta(fs.readFileSync(file, 'utf8'));
      if (!meta) return [];
      const url = `/${path.relative(root, file).split(path.sep).join('/')}`.replace(/index\.html$/, '');
      return [{ url, ...meta }];
    });
  const problems = auditMeta(pages);
  for (const p of problems) console.error(p);
  console.log(`${pages.length} pagini indexabile verificate, ${problems.length} probleme.`);
  if (problems.length) process.exitCode = 1;
}
