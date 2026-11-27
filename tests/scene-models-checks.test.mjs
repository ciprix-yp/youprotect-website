// Verificările cu modele din pipeline-ul de scene (T5b): logica pură (piele, croma, segment, OCR cu motor stub, combinatorul de ne-uman,
// calibrarea validată, fișa finală) fără modele AI. Logica e în tests/py/scene_models_checks_check.py (Pillow + numpy).
// Dovezi negative: segment cu piele/cromatic, text în decor și în zona I, logo diferit, câte un semnal pozitiv pe combinator,
// calibrare fără controale sau cu recall < 100%, fișă finală suprascrisă.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = join(ROOT, 'tests/py/scene_models_checks_check.py');
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

test('scene verificări cu modele: logică pură, pozitiv și negativ (fără modele)', (t) => {
  const runner = findRunner();
  if (!runner) return t.skip('nu există un Python cu Pillow și numpy');
  const [cmd, pre] = runner;
  const r = spawnSync(cmd, [...pre, CHECK, ROOT], { cwd: ROOT, encoding: 'utf8', timeout: 300_000 });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /^ok$/m);
  for (const needle of [
    'NEG segment cu ton de piele (224, 172, 105)',
    'NEG segment cromatic portocaliu',
    'POS segment gri acceptat',
    'POS segment N/A natură moartă',
    'NEG text în decor',
    'NEG text în zona I',
    'NEG text logo diferit de original',
    'NEG combinator: doar semnalul fețe e pozitiv',
    'NEG combinator: doar semnalul segment (piele) e pozitiv',
    'NEG combinator: doar semnalul SigLIP2 e pozitiv',
    'NEG combinator: doar semnalul VLM e pozitiv',
    'NEG calibrare cu prea puține controale',
    'NEG calibrare cu recall < 100%',
    'NEG fișa finală nu se suprascrie',
    'POS fisa_finala.json scrisă lângă fisa.json',
  ]) {
    assert.ok(r.stdout.includes(needle), `testul "${needle}" nu a rulat`);
  }
});
