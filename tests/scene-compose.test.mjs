// Pipeline-ul de scene (scripts/scene): compunerea, verificările și fișa/registrul, pe imagini sintetice mici, fără modele AI.
// Logica e în tests/py/scene_compose_check.py (Pillow + numpy). Se caută un Python cu Pillow și numpy: python3 de sistem,
// mediul scripts/scene/.venv sau `uv run --no-project --with pillow --with numpy`; dacă niciunul nu există, testul sare.
// Include dovezi negative: 1 px schimbat în L, oglindire, scalare 1.05, halo alb, scurgere de culoare, decor fluo,
// petic în export lossy, transformări nepermise, fișă incompletă/contrazisă, suprascriere, registru alterat, cale cu "..".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = join(ROOT, 'tests/py/scene_compose_check.py');
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

test('scene compunere: verificări deterministe, fișă și registru, pozitiv și negativ (imagini sintetice)', (t) => {
  const runner = findRunner();
  if (!runner) return t.skip('nu există un Python cu Pillow și numpy');
  const [cmd, pre] = runner;
  const r = spawnSync(cmd, [...pre, CHECK, ROOT], { cwd: ROOT, encoding: 'utf8', timeout: 300_000 });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /^ok$/m);
  for (const needle of [
    'POS determinism',
    'POS CIEDE2000',
    'NEG 1 px schimbat cu 1 nivel în L',
    'POS regresie F1: verificarea veche (pe L erodat) rata pixelul de margine',
    'NEG F1 pixel de pe marginea lui L schimbat cu +40',
    'NEG F1 pixel de margine L, check_scale_not_up',
    'POS F1 compunere corectă: identitate 0 pe L complet',
    'NEG F2 compunere VECHE (band_fill=False) pe bg cu E alb: halo',
    'POS F2 compunere NOUĂ pe același bg cu E alb: halo trece',
    'POS F2: L rămâne identic (diferență 0)',
    'POS F2 determinism',
    'POS F2 prepare_background',
    'NEG F2 fill_from_outside fără nicio sursă validă',
    'OGLINDIRE orizontal detectată',
    'scale=1.05 nu e în (0, 1]',
    'NEG scalare 1.05, fișă pretinde 1.0',
    'NEG inel de halo alb 2 px',
    'POS disc_dilate (sume cumulate)',
    'NEG contaminare albă de 12 px (intunecat)',
    'NEG contaminare albă de 12 px (deschis)',
    'NEG contaminare albă de 12 px (gradient)',
    'POS decor curat (gradient): band_contamination trece',
    'POS alb de 3 px',
    'NEG scurgere de culoare',
    'NEG decor galben fluo',
    'NEG export: petic schimbat',
    'dx=80.5 nu e întreg',
    'flip=True (trebuie False)',
    'rotate_deg=3 (trebuie 0)',
    'câmpuri obligatorii lipsă: seed',
    'NEG fișă fără sha256_master (T5a veche) respinsă',
    'NEG fișă fără sha256_raw respinsă',
    'NEG nume de fișă cu newline final',
    'contrazice verificările',
    'fișa există deja',
    "cale cu '..'",
    'NEG registru cu linie veche alterată',
    'NEG registru cu linie veche ștearsă',
  ]) {
    assert.ok(r.stdout.includes(needle), `testul "${needle}" nu a rulat`);
  }
});
