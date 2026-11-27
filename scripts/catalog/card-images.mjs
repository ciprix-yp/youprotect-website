// Miniaturile pentru cardurile din catalog (/produse/). Cardul arată poza principală a produsului la ~300 px, dar
// pozele din public/ au 1200–1800 px. Scriptul face lângă poză o variantă de exact 600×750 (4:5): <nume>-card.webp.
//  - packshot și studio: poza încape întreagă într-o cutie cu margine de 12 % (alb, sau transparent la PNG-urile cu alfa);
//    la studio se taie întâi marginile aproape-albe din jurul siluetei (contentBox), fără mărire peste sursă;
//  - scena: decupaj 4:5 din original, după `focus` din JSON. Geometria e în card-layout.mjs (pură, testată).
// Ținta: ≤ 60 KB pe card; calitatea coboară în trepte până încape. WebP fără EXIF/XMP/ICC (sharp nu le păstrează).
// Poza cardului vine din src/lib/catalog-images.js (cardImage); se face miniatură și pentru packshot-ul culorii principale
// când diferă de ea (dalele de categorie și og:image rămân pe packshot).
// Rulează după fetch_images_*.py și assemble_*.py, la fiecare produs nou: npm run catalog:cards [-- --force]
// tests/catalog-cards.test.mjs pică dacă un produs publicat nu are miniatura.
import { readdirSync, readFileSync, statSync, existsSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { cardImage, cardSrc, packshotImage } from '../../src/lib/catalog-images.js';
import { CARD_HEIGHT, CARD_WIDTH, contentBox, planCard } from './card-layout.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const PRODUCTS = join(ROOT, 'src/content/products');
const IMAGES = resolve(ROOT, 'public/images/products');
const QUALITIES = [78, 70, 62, 54, 46, 40];
const TARGET_BYTES = 60 * 1024;
const force = process.argv.includes('--force');

/** Calea din JSON („/images/products/…”) -> fișierul din public/, doar dacă rămâne în public/images/products. */
function publicFile(src) {
  const file = resolve(ROOT, 'public', `.${src}`);
  if (!file.startsWith(IMAGES + sep)) throw new Error(`cale în afara pozelor de produs: ${src}`);
  return file;
}

/** Miniatura 600×750 a unei poze, ca buffer WebP, încadrată în TARGET_BYTES dacă se poate. */
async function renderCard(input, photo) {
  const meta = await sharp(input).metadata();
  let content;
  if (photo.kind === 'studio') {
    // poză pe fond alb: se taie marginile aproape-albe (card-layout.mjs), ca silueta să umple cutia
    const { data, info } = await sharp(input).raw().toBuffer({ resolveWithObject: true });
    content = contentBox(data, info.width, info.height, info.channels);
  }
  const plan = planCard({ width: meta.width, height: meta.height, kind: photo.kind, focus: photo.focus, content });
  let canvas;
  if (plan.mode === 'crop') {
    canvas = sharp(input).extract(plan.extract).resize(CARD_WIDTH, CARD_HEIGHT, { fit: 'fill' }).flatten({ background: '#ffffff' });
  } else {
    const source = plan.extract ? sharp(input).extract(plan.extract) : sharp(input);
    const inner = await source.resize(plan.width, plan.height, { fit: 'fill' }).toBuffer();
    const alpha = Boolean(meta.hasAlpha);
    canvas = sharp({
      create: {
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        channels: alpha ? 4 : 3,
        background: alpha ? { r: 255, g: 255, b: 255, alpha: 0 } : { r: 255, g: 255, b: 255 },
      },
    }).composite([{ input: inner, left: plan.left, top: plan.top }]);
  }
  const { data, info } = await canvas.raw().toBuffer({ resolveWithObject: true });
  let out;
  for (const quality of QUALITIES) {
    out = await sharp(data, { raw: info }).webp({ quality, effort: 6 }).toBuffer();
    if (out.length <= TARGET_BYTES) break;
  }
  return out;
}

async function upToDate(output, sources) {
  if (force || !existsSync(output)) return false;
  const built = statSync(output).mtimeMs;
  if (sources.some((s) => statSync(s).mtimeMs > built)) return false;
  const meta = await sharp(output).metadata();
  return meta.width === CARD_WIDTH && meta.height === CARD_HEIGHT; // miniaturile vechi (600×600) se refac
}

let made = 0;
for (const name of readdirSync(PRODUCTS).filter((n) => n.endsWith('.json')).sort()) {
  const jsonFile = join(PRODUCTS, name);
  const data = JSON.parse(readFileSync(jsonFile, 'utf8'));
  if (!data.colours?.[0]?.images?.[0]?.src) continue;
  const photos = [cardImage(data)];
  const shot = packshotImage(data);
  if (shot.src !== photos[0].src) photos.push({ src: shot.src, kind: 'packshot', focus: null });
  for (const photo of photos) {
    const card = cardSrc(photo.src);
    if (card === photo.src) continue; // poză externă: cardul folosește poza mare
    const input = publicFile(photo.src);
    const output = publicFile(card);
    if (await upToDate(output, [input, jsonFile])) continue;
    const bytes = await renderCard(input, photo);
    writeFileSync(output, bytes);
    made += 1;
    const note = bytes.length > TARGET_BYTES ? ' (peste ținta de 60 KB)' : '';
    console.log(`${card}: ${photo.kind}, ${Math.round(statSync(input).size / 1024)} KB -> ${Math.round(bytes.length / 1024)} KB${note}`);
  }
}
console.log(`miniaturi noi: ${made}`);
