#!/usr/bin/env node
// Verifică documentele din fișele de produs (fișe tehnice, declarații): fiecare link trebuie să dea un PDF.
// Pe 19.11.2026, patru declarații Sir Safety (MC1111, MC1113, MC3012, MC3014) întorceau o pagină HTML sau 404, deși
// linkurile erau pe site. Rulează lunar în CI (.github/workflows/documente-lunar.yml) și local:
//   node scripts/catalog/check-documents.mjs
// Doar https și doar gazdele furnizorilor de mai jos; citește primii octeți ai fiecărui fișier.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const PRODUCTS = join(ROOT, 'src/content/products');
// Gazdele de unde vin documentele în fișe: Sir Safety și CDN-ul MASCOT.
const ALLOWED_HOSTS = new Set(['www.sirsafety.com', 'mascotsitecore-1ccb8.kxcdn.com']);

const docs = readdirSync(PRODUCTS)
  .filter((n) => n.endsWith('.json'))
  .flatMap((n) => {
    const data = JSON.parse(readFileSync(join(PRODUCTS, n), 'utf8'));
    return data.status === 'published' ? data.documents.map((d) => ({ product: n.replace(/\.json$/, ''), ...d })) : [];
  });

let broken = 0;
for (const doc of docs) {
  const url = new URL(doc.url);
  if (url.protocol !== 'https:' || !ALLOWED_HOSTS.has(url.hostname)) {
    console.error(`${doc.product}: gazdă neașteptată ${url.hostname} (adaug-o în ALLOWED_HOSTS dacă e a unui furnizor)`);
    broken++;
    continue;
  }
  let head = '';
  try {
    const res = await fetch(url, { headers: { Range: 'bytes=0-7' }, signal: AbortSignal.timeout(30_000) });
    head = res.ok ? new TextDecoder().decode((await res.arrayBuffer()).slice(0, 5)) : `HTTP ${res.status}`;
  } catch (err) {
    head = String(err.message ?? err);
  }
  if (head !== '%PDF-') {
    console.error(`${doc.product}: ${doc.label} nu e PDF (${head.trim().slice(0, 30)}): ${doc.url}`);
    broken++;
  }
  await new Promise((r) => setTimeout(r, 300));
}
console.log(`${docs.length} documente verificate, ${broken} probleme.`);
if (broken) process.exitCode = 1;
