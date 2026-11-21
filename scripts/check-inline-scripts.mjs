#!/usr/bin/env node
// Verifică în build (dist/) că scripturile de pe fiecare pagină stau în pagină, nu în fișiere separate.
// Rulează în CI după `npm run build`; iese cu cod 1 dacă o pagină încarcă un script-modul extern nepermis.
//   node scripts/check-inline-scripts.mjs [dist]
//
// De ce: un script extern se descarcă după HTML și poate rula în timpul tranziției dintre pagini (@view-transition din
// global.css); atunci Chrome sare tranziția, iar poza nu mai trece din card în fișa produsului. S-a întâmplat de două
// ori (scriptul de statistici, PR #80; lista de ofertă, 20.11.2026): măsurat, 8 tranziții sărite din 16 cu scriptul
// din BaseLayout ca fișier separat, 0 din 28 cu el în pagină (D-2026-11-20-14). astro.config.mjs le ține în pagină
// (inlineLayoutScripts), dar Astro le scoate oricum dacă importă un modul folosit și de alt script.
//
// Permise: scriptul de preîncărcare al lui Astro (page.*.js) și scriptul paginii /confirmare/ (calendarul).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const ALLOWED = [/^\/_astro\/page\.[\w-]+\.js$/, /^\/_astro\/confirmare\.astro_astro_type_script_index_\d+_lang\.[\w-]+\.js$/];

/** Adresele scripturilor-modul externe din pagină. */
export function externalModuleScripts(html) {
  return [...html.matchAll(/<script\b[^>]*\btype="module"[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1]);
}

/** Problemele pentru o listă de pagini { url, html }. */
export function auditScripts(pages) {
  const problems = [];
  for (const { url, html } of pages) {
    for (const src of externalModuleScripts(html)) {
      if (!ALLOWED.some((re) => re.test(src))) problems.push(`${url}: script extern ${src}`);
    }
  }
  return problems;
}

function htmlFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? htmlFiles(p) : e.name.endsWith('.html') ? [p] : [];
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const dist = path.resolve(process.argv[2] ?? 'dist');
  const pages = htmlFiles(dist).map((file) => ({ url: `/${path.relative(dist, file)}`, html: fs.readFileSync(file, 'utf8') }));
  const problems = auditScripts(pages);
  if (problems.length) {
    console.error(`Scripturi care trebuie să stea în pagină (vezi comentariul din ${path.basename(process.argv[1])}):`);
    for (const p of [...new Set(problems.map((p) => p.replace(/^[^:]+: /, '')))]) console.error(`  ${p}`);
    console.error(`${problems.length} apariții în ${pages.length} pagini.`);
    process.exit(1);
  }
  console.log(`Scripturi în pagină: OK (${pages.length} pagini).`);
}
