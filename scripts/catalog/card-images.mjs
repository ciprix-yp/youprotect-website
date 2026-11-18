// Miniaturile pentru cardurile din catalog (/produse/). Cardul arată prima poză a primei culori la ~300 px, dar poza
// de produs are 1200 px. Scriptul face lângă ea o variantă de 600 px: <nume>-card.webp.
// Rulează după fetch_images_*.py și assemble_*.py, la fiecare produs nou: npm run catalog:cards
// tests/catalog-cards.test.mjs pică dacă un produs publicat nu are miniatura.
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { cardSrc } from '../../src/lib/catalog-images.js';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const PRODUCTS = join(ROOT, 'src/content/products');
const IMAGES = resolve(ROOT, 'public/images/products');

/** Calea din JSON („/images/products/…”) -> fișierul din public/, doar dacă rămâne în public/images/products. */
function publicFile(src) {
  const file = resolve(ROOT, 'public', `.${src}`);
  if (!file.startsWith(IMAGES + sep)) throw new Error(`cale în afara pozelor de produs: ${src}`);
  return file;
}

let made = 0;
for (const name of readdirSync(PRODUCTS).filter((n) => n.endsWith('.json')).sort()) {
  const data = JSON.parse(readFileSync(join(PRODUCTS, name), 'utf8'));
  const src = data.colours?.[0]?.images?.[0]?.src;
  const card = cardSrc(src);
  if (!src || card === src) continue; // poză externă sau lipsă: cardul folosește poza mare
  const input = publicFile(src);
  const output = publicFile(card);
  if (existsSync(output) && statSync(output).mtimeMs >= statSync(input).mtimeMs) continue;
  await sharp(input)
    .resize({ width: 600, height: 600, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 78, effort: 6 })
    .toFile(output);
  made += 1;
  console.log(`${card}: ${Math.round(statSync(input).size / 1024)} KB -> ${Math.round(statSync(output).size / 1024)} KB`);
}
console.log(`miniaturi noi: ${made}`);
