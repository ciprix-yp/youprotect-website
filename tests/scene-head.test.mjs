// T5c: semnalul „formă de cap” (geometrie determinist + combinator cu VLM) și regula de croma nuanțată, fără modele AI (Pillow + numpy).
// Dovezi negative: dom sintetic respins, doar geometria sau doar VLM e pozitiv, piele/bej/portocaliu/albastru respinse și cu regula nuanțată,
// descriptor stricat pică testul pozitiv.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = join(ROOT, 'tests/py/scene_head_check.py');
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

test('scene T5c: formă de cap și croma nuanțată, pozitiv și negativ (fără modele)', (t) => {
  const runner = findRunner();
  if (!runner) return t.skip('nu există un Python cu Pillow și numpy');
  const [cmd, pre] = runner;
  const r = spawnSync(cmd, [...pre, CHECK, ROOT], { cwd: ROOT, encoding: 'utf8', timeout: 300_000 });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /^ok$/m);
  for (const needle of [
    'NEG overlay gol {praguri: {}} respins',
    'NEG overlay head.vlm_products=[] respins',
    'NEG overlay head.vlm_p_yes=1.0 respins',
    'NEG overlay head.sag_ratio_min=0.225 respins',
    'POS overlay mai strict',
    'POS overlay-ul real acceptat identic',
    'NEG același id, alt sha256 -> respins fail-closed (veto învechit)',
    'POS id fără veto (hala_depozit-s101) trece',
    'POS dom sintetic (semisferă liberă) detectat',
    'POS trunchi cu vârf tăiat drept acceptat',
    'POS vârf tăiat drept înclinat acceptat',
    'POS vârf ascuns sub guler',
    'NEG descriptor stricat (sag inversat)',
    'NEG head_shape: doar geometria e pozitivă',
    'NEG head_shape: doar VLM e pozitiv',
    'NEG combinator: doar semnalul „cap” (geometrie) e pozitiv',
    'NEG combinator: doar semnalul „cap” (VLM) e pozitiv',
    'POS gri cu nuanță moderată acceptat pe calea nuanțată',
    'NEG aceeași nuanță cade pe regula veche',
    'NEG segment piele respins și cu regula nuanțată',
    'NEG segment bej/carton respins și cu regula nuanțată',
    'NEG segment portocaliu puternic respins și cu regula nuanțată',
    'NEG segment albastru puternic respins și cu regula nuanțată',
    'POS VLM de cap se aplică doar produsului calibrat',
    'NEG veto manual respinge ambele mastere',
    'NEG veto cu cheie id (nu sha256) respins la îmbinare',
    'NEG veto fără autor respins la îmbinare',
    'NEG overlay care relaxează vlm_p_yes=1.01 respins',
    'NEG overlay care relaxează yunet_score=1.01 respins',
    'NEG overlay care relaxează skin_whole_max=1.0 respins',
    'NEG overlay cu segment.skin_frac_max relaxat respins',
    'NEG validate_calibration recalculează controalele: vlm_p_yes=1.01',
    'POS boots_two_info e informativ',
  ]) {
    assert.ok(r.stdout.includes(needle), `testul "${needle}" nu a rulat`);
  }
});
