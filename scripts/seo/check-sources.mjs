#!/usr/bin/env node
// Verifică sursele citate pe site: cele din ghiduri (src/lib/guides.ts) și sursele paginilor de marcă
// (src/lib/catalog-brands.ts). Fiecare trebuie să răspundă fără eroare, și după redirecturi.
// Pe 27.11.2026, patru surse MASCOT din ghidul despre haine de lucru dădeau 404: MASCOT își mutase site-ul, iar
// adresele vechi redirecționau spre pagini care nu mai existau. Rulează lunar în CI
// (.github/workflows/documente-lunar.yml) și local:
//   node scripts/seo/check-sources.mjs
// Doar https; adresele vin din fișierele noastre, nu din afară.
import { GUIDES } from '../../src/lib/guides.ts';
import { BRAND_PAGES } from '../../src/lib/catalog-brands.ts';

const sources = new Map();
for (const g of GUIDES) for (const s of g.sources) sources.set(s.url, [...(sources.get(s.url) ?? []), `ghid ${g.slug}`]);
for (const b of BRAND_PAGES) sources.set(b.source.url, [...(sources.get(b.source.url) ?? []), `marca ${b.slug}`]);

const RATE_LIMITED = new Set([429, 503]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let broken = 0;
let warnings = 0;
for (const [href, usedBy] of sources) {
  const url = new URL(href);
  if (url.protocol !== 'https:') {
    console.error(`${usedBy.join(', ')}: sursa nu e https: ${href}`);
    broken++;
    continue;
  }
  let problem = '';
  let status = 0;
  // 429 și 503 înseamnă că serverul limitează cererile (web.archive.org o face des), nu că pagina lipsește:
  // reîncercăm de două ori, cu pauză, iar dacă tot nu merge, e doar avertisment.
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await sleep(attempt * 15_000);
    problem = '';
    try {
      // Unele site-uri răspund altfel unui client fără antet de browser; trimitem unul generic.
      const res = await fetch(url, {
        redirect: 'follow',
        headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html,application/pdf;q=0.9,*/*;q=0.8' },
        signal: AbortSignal.timeout(30_000),
      });
      await res.body?.cancel();
      status = res.status;
      if (!res.ok) problem = `HTTP ${res.status}${res.redirected ? ` după redirect la ${res.url}` : ''}`;
    } catch (err) {
      status = 0;
      problem = String(err.cause?.code ?? err.message ?? err);
    }
    if (!RATE_LIMITED.has(status)) break;
  }
  if (problem && RATE_LIMITED.has(status)) {
    console.warn(`${usedBy.join(', ')}: ${problem} (serverul limitează cererile; verifică manual): ${href}`);
    warnings++;
  } else if (problem) {
    console.error(`${usedBy.join(', ')}: ${problem}: ${href}`);
    broken++;
  }
  await sleep(1_000);
}
console.log(`${sources.size} surse verificate, ${broken} probleme, ${warnings} avertismente.`);
if (broken) process.exitCode = 1;
