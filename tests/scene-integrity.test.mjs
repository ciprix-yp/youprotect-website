// Fix-1a: legături de integritate (fișă <-> imagine/sursă/zone/registru), produs ≠ zone, verificarea modelului înainte de încărcare,
// overlay și etape obligatorii, scriere exclusivă, prompt și fetch_models. Fără modele AI (Pillow + numpy). Logica: tests/py/scene_integrity_check.py.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = join(ROOT, 'tests/py/scene_integrity_check.py');
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

test('scene Fix-1a: integritate fișă/imagine/zone, produs ≠ zone, model verificat, overlay obligatoriu (negative + pozitive)', (t) => {
  const runner = findRunner();
  if (!runner) return t.skip('nu există un Python cu Pillow și numpy');
  const [cmd, pre] = runner;
  const r = spawnSync(cmd, [...pre, CHECK, ROOT], { cwd: ROOT, encoding: 'utf8', timeout: 300_000 });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /^ok$/m);
  for (const needle of [
    'NEG scanare AST: os.environ.setdefault',
    'POS scripturile cu modele setează FORȚAT',
    'NEG produs S476YE cu zone BZ739OR respins',
    'NEG calea sursei din zone.json nu corespunde produsului',
    'NEG generate_candidates: --product S476YE cu zone BZ739OR',
    'NEG candidate_items: director S476YE cu zone.json BZ739OR',
    'NEG candidate_items: director S476YE cu fișă BZ739OR',
    'NEG candidate_items: director de candidat fără fisa.json',
    'NEG fișă T5a veche fără sha256_master refuzată',
    'POS --legacy: fișa veche e acceptată doar marcat',
    'NEG fișă de intrare fără color_spill/decor_fluo',
    'NEG load_zones: marcaj critic alterat',
    'NEG load_zones: fișier lipsă din zone.json',
    'NEG scriere exclusivă: --out existent nu se suprascrie',
    'NEG klein_probe: --model-id cu',
    'NEG klein_probe (CLI) cu --model-id ../x',
    'POS verify_model: hash-ul din fișă = sha256 recalculat',
    'NEG model alterat (aceeași mărime)',
    'NEG model cu mărime greșită respins',
    'NEG fișier bun dar manifest cu alt hash respins',
    'NEG scanare AST: from_pretrained fără trust_remote_code=False',
    'POS toate apelurile from_pretrained',
    'NEG scanare AST: script cu modele fără HF_HUB_OFFLINE',
    'POS generate_candidates și klein_probe verifică fișierele modelului',
    'NEG run_model_checks fără --calibrare-extra',
    'POS run_model_checks, make_planse, README și PROJECT_OS folosesc același nume',
    'POS sha256_code acoperă calea efectivă',
    'NEG manechin_fraza per produs cu cuvinte interzise',
    'NEG manechin.fraza generală cu cuvânt interzis',
    'NEG .part dintr-o rulare anterioară',
    'NEG fișier deja descărcat, manifest fără hash',
  ]) {
    assert.ok(r.stdout.includes(needle), `testul "${needle}" nu a rulat`);
  }
});
