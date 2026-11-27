// Pipeline-ul de scene (scripts/scene): funcțiile pure ale probei FLUX.2 klein (rezoluție la multiplu de 16, validarea căilor).
// Logica e în tests/py/scene_klein_check.py (doar stdlib, `python3 -I`); fără torch și fără modele; sare dacă nu există python3.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = join(ROOT, 'tests/py/scene_klein_check.py');
const hasPython = () => spawnSync('python3', ['-I', '-c', 'import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)']).status === 0;

test('scene: klein_lib respinge rezoluții/căi invalide și suprascrierea directorului de rulare', (t) => {
  if (!hasPython()) return t.skip('python3 lipsește');
  const r = spawnSync('python3', ['-I', CHECK, ROOT], { cwd: ROOT, encoding: 'utf8', timeout: 60_000 });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /^ok$/m);
});
