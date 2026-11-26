// Portretul fondatoarei din eroul /despre-noi/ (PortraitHero): variantele WebP n-au metadate (EXIF/XMP/ICCP; originalul are
// date de cameră și autor), sunt sub 250 KB, iar <img>-ul e LCP (eager + fetchpriority high), fără overflow-hidden.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const data = JSON.parse(readFileSync(join(ROOT, 'src/data/portret-alexandra.json'), 'utf8'));

function chunks(buf) {
  assert.equal(buf.subarray(0, 4).toString('ascii'), 'RIFF');
  assert.equal(buf.subarray(8, 12).toString('ascii'), 'WEBP');
  const out = [];
  for (let pos = 12; pos + 8 <= buf.length; ) {
    const size = buf.readUInt32LE(pos + 4);
    out.push(buf.subarray(pos, pos + 4).toString('ascii'));
    pos += 8 + size + (size & 1);
  }
  return out;
}

test('portret: 4 variante (640/960/1280/1536), sub 250 KB, fără EXIF/XMP/ICC', () => {
  assert.deepEqual(data.variants.map((v) => v.width), [640, 960, 1280, 1536]);
  for (const v of data.variants) {
    const file = join(ROOT, 'public/images', v.file);
    const buf = readFileSync(file);
    assert.equal(statSync(file).size, v.bytes, `${v.file}: bytes din JSON diferă`);
    assert.ok(buf.length <= 250 * 1024, `${v.file} peste 250 KB`);
    const bad = chunks(buf).filter((c) => ['EXIF', 'XMP ', 'ICCP'].includes(c));
    assert.deepEqual(bad, [], `${v.file} are metadate`);
    // Doar markeri structurali de metadate (fără nume de persoane).
    assert.ok(!/Exif\0\0|<x:xmpmeta|ns\.adobe\.com\/xap|ICC_PROFILE|Canon|Lightroom/.test(buf.toString('latin1')), `${v.file}: urme de metadate de cameră`);
  }
});

test('PortraitHero: img LCP (eager, fetchpriority high), fără overflow-hidden, mișcare sd-*', () => {
  const src = readFileSync(join(ROOT, 'src/components/global/PortraitHero.astro'), 'utf8');
  const code = src.replace(/^\/\/.*$/gm, '');
  assert.ok(/loading="eager"/.test(code) && /fetchpriority="high"/.test(code));
  assert.ok(/width=\{biggest\.width\}/.test(code) && /height=\{biggest\.height\}/.test(code));
  assert.ok(!/overflow-hidden/.test(code));
  assert.ok(/sd-hero-media/.test(code) && /sd-hero-content/.test(code));
  assert.ok(!/creditText|copyrightNotice|ImageObject/.test(code), 'fără credit inventat');
});
