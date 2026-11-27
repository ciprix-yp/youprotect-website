// Recompunerea candidaților din ieșirile existente (scripts/scene/recompose_candidates.py), pe imagini sintetice, fără modele AI și fără pymatting.
// Logica e în tests/py/scene_recompose_check.py (Pillow + numpy). Include dovezi negative: suprascriere, out-base existent/relativ/cu "..",
// raw alterat față de fișa veche, fișă pentru alt produs; și pozitive: hash-uri pe fișierele salvate, registru, director vechi neatins, halo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = join(ROOT, 'tests/py/scene_recompose_check.py');
const PROBE = 'import PIL, numpy';

function findRunner() {
  const cands = [['python3', ['-I']]];
  const venv = join(ROOT, 'scripts/scene/.venv/bin/python');
  if (existsSync(venv)) cands.push([venv, ['-I']]);
  cands.push(['uv', ['run', '--no-project', '--with', 'pillow', '--with', 'numpy', 'python', '-I']]);
  for (const [cmd, pre] of cands) {
    const r = spawnSync(cmd, [...pre, '-c', PROBE], { encoding: 'utf8', timeout: 120_000 });
    if (r.status === 0) return [cmd, pre];
  }
  return null;
}

test('scene recompunere: director nou, fișă recompusă, identitate pe L complet, umplerea benzii E (imagini sintetice)', (t) => {
  const runner = findRunner();
  if (!runner) return t.skip('nu există un Python cu Pillow și numpy');
  const [cmd, pre] = runner;
  const r = spawnSync(cmd, [...pre, CHECK, ROOT], { cwd: ROOT, encoding: 'utf8', timeout: 300_000 });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /^ok$/m);
  for (const needle of [
    'POS recompunere: hash-uri pe fișierele salvate',
    'NEG band_fill=False pe același raw: halo pică',
    'POS band_fill=True pe același raw: halo trece',
    'POS determinism: două recompuneri',
    'NEG candidat deja recompus (fără suprascriere)',
    'NEG out-base există',
    'NEG out-base cu ..',
    'NEG out-base în cand-base',
    'NEG raw alterat față de sha256_raw din fișa veche',
    'NEG fișă pentru alt produs decât numele',
  ]) {
    assert.ok(r.stdout.includes(needle), `testul "${needle}" nu a rulat`);
  }
});
