// Pipeline-ul de scene (scripts/scene): zonele L/E/I și verificarea lor, pe imagini sintetice mici, fără modele AI.
// Logica e în tests/py/scene_zones_check.py (Pillow + numpy). Se caută un Python cu Pillow și numpy: python3 de sistem,
// mediul scripts/scene/.venv sau `uv run --no-project --with pillow --with numpy`; dacă niciunul nu există, testul sare.
// Include dovezi negative: marcaj critic ieșit din L cu 1 px, I care atinge L sau marginea, E în afara benzii,
// hash de mască, sha256 de sursă și suprapuneri L/E trebuie să pice.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = join(ROOT, 'tests/py/scene_zones_check.py');
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

test('scene zone: L/E/I, marcaje critice și verificare, pozitiv și negativ (imagini sintetice)', (t) => {
  const runner = findRunner();
  if (!runner) return t.skip('nu există un Python cu Pillow și numpy');
  const [cmd, pre] = runner;
  const r = spawnSync(cmd, [...pre, CHECK, ROOT], { cwd: ROOT, encoding: 'utf8', timeout: 300_000 });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /^ok$/m);
  for (const needle of [
    'MARCAJ CRITIC IESE DIN L',
    'SUPRAPUNERE L/I',
    'I ATINGE MARGINEA SILUETEI',
    'E IN AFARA BANDEI',
    'HASH L',
    'SHA256 SURSA',
    'SUPRAPUNERE L/E',
  ]) {
    assert.ok(r.stdout.includes(needle), `testul negativ "${needle}" nu a rulat`);
  }
});
