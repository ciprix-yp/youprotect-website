// Avertismentele de structură din scripts/catalog/lint_texts.py (08-GHID_CONTINUT.md §8): „nu …, ci” des, fraze de
// rezumat, fraze de aceeași lungime. Verificarea e în tests/py/lint_texts_check.py (doar biblioteca standard Python).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

test('lint_texts: semnele de structură sunt avertismente, cu pragurile din §8', (t) => {
  const probe = spawnSync('python3', ['-I', '-c', 'import statistics'], { encoding: 'utf8' });
  if (probe.status !== 0) return t.skip('python3 lipsește: verificarea linterului sare');
  const run = spawnSync('python3', ['-I', 'tests/py/lint_texts_check.py', ROOT], { cwd: ROOT, encoding: 'utf8', timeout: 60_000 });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  assert.match(run.stdout, /ok/);
});
