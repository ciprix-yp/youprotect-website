// Imaginile din public/ se servesc exact cum sunt. Pe 18.11.2026 homepage-ul încărca 5,1 MB pe telefon, aproape tot din
// poze PNG de 600–900 KB afișate la câteva sute de pixeli. Le-am trecut pe WebP la mărimea afișată; testul ține limita.
// Cum micșorezi o imagine nouă: cwebp -q 80 -m 6 -metadata none -resize <lățime> 0 in.png -o out.webp
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PUBLIC = join(ROOT, 'public');
const IMAGE = /\.(png|jpe?g|webp|avif|gif)$/i;
const MAX_KB = 250;

function imagesUnder(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return imagesUnder(path);
    return IMAGE.test(entry.name) ? [path] : [];
  });
}

test(`imagini: niciuna din public/ peste ${MAX_KB} KB`, () => {
  const heavy = imagesUnder(PUBLIC)
    .map((file) => ({ file: relative(ROOT, file), kb: Math.round(statSync(file).size / 1024) }))
    .filter(({ kb }) => kb > MAX_KB)
    .map(({ file, kb }) => `${file}: ${kb} KB`);
  assert.deepEqual(heavy, []);
});
