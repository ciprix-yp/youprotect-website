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
const FORBIDDEN = new Set(['EXIF', 'XMP ', 'ICCP']);

function webpFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return webpFiles(path);
    return entry.name.endsWith('.webp') ? [path] : [];
  });
}

/** Numele chunk-urilor RIFF dintr-un WebP; aruncă dacă fișierul nu e RIFF/WEBP sau chunk-urile ies din fișier. */
function riffChunks(buffer) {
  if (buffer.length < 12 || buffer.toString('latin1', 0, 4) !== 'RIFF' || buffer.toString('latin1', 8, 12) !== 'WEBP') {
    throw new Error('nu e RIFF/WEBP');
  }
  const names = [];
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const size = buffer.readUInt32LE(offset + 4);
    names.push(buffer.toString('latin1', offset, offset + 4));
    offset += 8 + size + (size % 2); // chunk-urile sunt aliniate la 2 octeți
  }
  if (offset > buffer.length + 1) throw new Error('chunk în afara fișierului');
  return names;
}

test('riffChunks: recunoaște chunk-urile și respinge ce nu e WebP', () => {
  const chunk = (name, size) => Buffer.concat([Buffer.from(name, 'latin1'), Buffer.from(new Uint32Array([size]).buffer), Buffer.alloc(size + (size % 2))]);
  const body = Buffer.concat([Buffer.from('WEBP', 'latin1'), chunk('VP8X', 10), chunk('EXIF', 3), chunk('VP8 ', 4)]);
  const file = Buffer.concat([Buffer.from('RIFF', 'latin1'), Buffer.from(new Uint32Array([body.length]).buffer), body]);
  assert.deepEqual(riffChunks(file), ['VP8X', 'EXIF', 'VP8 ']);
  assert.throws(() => riffChunks(Buffer.from('nu e imagine, doar text lung')), /RIFF/);
});

test('imagini de produs: niciun .webp cu EXIF, XMP sau ICC', () => {
  const files = webpFiles(PRODUCTS);
  assert.ok(files.length > 0, 'nu s-a găsit nicio poză de verificat');
  const dirty = files
    .filter((file) => riffChunks(readFileSync(file)).some((name) => FORBIDDEN.has(name)))
    .map((file) => relative(ROOT, file));
  assert.deepEqual(dirty, []);
});
