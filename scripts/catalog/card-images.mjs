// Miniaturile pentru cardurile din catalog (/produse/). Cardul arată prima poză a primei culori la ~300 px, dar poza
// de produs are 1200 px. Scriptul face lângă ea o variantă de 600 px: <nume>-card.webp.
// Tot de aici vine <nume>-print.jpg (600 px, JPEG pe fond alb), pe care /catalog/ o folosește la „Salvează ca PDF”
// (src/lib/catalog-images.js, printSrc).
// Rulează după fetch_images_*.py și assemble_*.py, la fiecare produs nou: npm run catalog:cards
// tests/catalog-cards.test.mjs pică dacă un produs publicat nu are miniatura sau varianta pentru PDF.
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { cardSrc, printSrc } from '../../src/lib/catalog-images.js';

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
  const fresh = (file) => existsSync(file) && statSync(file).mtimeMs >= statSync(input).mtimeMs;
  const resized = () => sharp(input).resize({ width: 600, height: 600, fit: 'inside', withoutEnlargement: true });
  const output = publicFile(card);
  if (!fresh(output)) {
    await resized().webp({ quality: 78, effort: 6 }).toFile(output);
    made += 1;
    console.log(`${card}: ${Math.round(statSync(input).size / 1024)} KB -> ${Math.round(statSync(output).size / 1024)} KB`);
  }
  // Pentru PDF: JPEG fără transparență (fondul transparent ar ieși negru), alb ca fondul pozelor de produs.
  const print = publicFile(printSrc(src));
  if (!fresh(print)) {
    await resized().flatten({ background: '#ffffff' }).jpeg({ quality: 80, mozjpeg: true }).toFile(print);
    made += 1;
    console.log(`${printSrc(src)}: ${Math.round(statSync(print).size / 1024)} KB`);
  }
}
console.log(`variante noi: ${made}`);
