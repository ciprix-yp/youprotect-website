// Pozele de produs din public/images/products nu trebuie să poarte metadate (EXIF, XMP, profil ICC): pot conține GPS,
// autor, program de editare sau date interne ale furnizorului. scripts/lib/safe_fetch.py le scoate la descărcare
// (webp_forbidden_chunks), iar sharp nu le păstrează la miniaturi (card-images.mjs). Testul verifică prin structura RIFF,
// pe TOATE fișierele .webp de produs (27.11.2026: 779 de fișiere, niciunul cu metadate).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PRODUCTS = join(ROOT, 'public/images/products');
import { FORBIDDEN_CHUNKS as FORBIDDEN, riffChunks } from '../scripts/catalog/webp-riff.mjs';

function webpFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return webpFiles(path);
    return entry.name.endsWith('.webp') ? [path] : [];
  });
}

test('riffChunks: recunoaște chunk-urile și respinge ce nu e WebP', () => {
  const chunk = (name, size) => Buffer.concat([Buffer.from(name, 'latin1'), Buffer.from(new Uint32Array([size]).buffer), Buffer.alloc(size + (size % 2))]);
  const body = Buffer.concat([Buffer.from('WEBP', 'latin1'), chunk('VP8X', 10), chunk('EXIF', 3), chunk('VP8 ', 4)]);
  const file = Buffer.concat([Buffer.from('RIFF', 'latin1'), Buffer.from(new Uint32Array([body.length]).buffer), body]);
  assert.deepEqual(riffChunks(file), ['VP8X', 'EXIF', 'VP8 ']);
  assert.throws(() => riffChunks(Buffer.from('nu e imagine, doar text lung')), /RIFF/);
  // fișier trunchiat: chunk care iese din fișier, sau octeți în plus după ultimul chunk
  assert.throws(() => riffChunks(file.subarray(0, file.length - 2)), /în afara fișierului/);
  assert.throws(() => riffChunks(Buffer.concat([file, Buffer.from([0])])), /în afara fișierului/);
});

test('imagini de produs: niciun .webp cu EXIF, XMP sau ICC', () => {
  const files = webpFiles(PRODUCTS);
  assert.ok(files.length > 0, 'nu s-a găsit nicio poză de verificat');
  const dirty = files
    .filter((file) => riffChunks(readFileSync(file)).some((name) => FORBIDDEN.has(name)))
    .map((file) => relative(ROOT, file));
  assert.deepEqual(dirty, []);
});
