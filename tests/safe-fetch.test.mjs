// Descărcarea sigură de imagini (scripts/lib/safe_fetch.py) și poza pe model (scripts/catalog/card_photo.py): redirect pe alt
// host, fișier care nu e imagine, imagine prea mare, nume cu `..`, metadate EXIF/XMP/ICC într-un WebP, cardPhoto invalid.
// Verificările rulează în Python (tests/py/*.py), fără rețea. safe_fetch_check.py cere Pillow: se rulează cu python3 dacă îl
// are, altfel cu uv; fără niciuna testul sare. card_photo_check.py nu cere Pillow.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const check = (name) => join(ROOT, 'tests/py', name);
const run = (cmd, args) => spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', timeout: 180_000 });

function pythonWithPillow() {
  if (run('python3', ['-I', '-c', 'import PIL']).status === 0) return ['python3', ['-I']];
  if (run('uv', ['--version']).status === 0) return ['uv', ['run', '--no-project', '--with', 'pillow', 'python', '-I']];
  if (run('mise', ['exec', 'uv@0.13.6', '--', 'uv', '--version']).status === 0) {
    return ['mise', ['exec', 'uv@0.13.6', '--', 'uv', 'run', '--no-project', '--with', 'pillow', 'python', '-I']];
  }
  return null;
}

test('safe_fetch: redirect pe alt host, ne-imagine, imagine prea mare, nume cu .., metadate în WebP', (t) => {
  const cmd = pythonWithPillow();
  if (!cmd) return t.skip('nici python3 cu Pillow, nici uv: verificarea sare');
  const r = run(cmd[0], [...cmd[1], check('safe_fetch_check.py'), ROOT]);
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /^ok$/m);
});

test('cardPhoto: validare, lint și poziția 0 din images[] la assemble', () => {
  const r = run('python3', ['-I', check('card_photo_check.py'), ROOT]);
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /^ok$/m);
});
