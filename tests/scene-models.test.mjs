// Pipeline-ul de scene (scripts/scene): manifestul de modele și scriptul de descărcare verificate, fără rețea.
// Logica e în tests/py/scene_models_check.py (doar stdlib, rulat cu `python3 -I`); sare dacă nu există python3.
// Include dovada negativă: un manifest stricat (extensie .pt, cale cu .., sha256 greșit) TREBUIE să pice.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = join(ROOT, 'tests/py/scene_models_check.py');
const MANIFEST = join(ROOT, 'scripts/scene/models.lock.json');
const run = (args) => spawnSync('python3', ['-I', CHECK, ROOT, ...args], { cwd: ROOT, encoding: 'utf8', timeout: 120_000 });
const hasPython = () => spawnSync('python3', ['-I', '-c', 'import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)']).status === 0;

test('scene: manifest valid, funcțiile din fetch_models resping .pt, .., hash greșit (pe fișiere sintetice)', (t) => {
  if (!hasPython()) return t.skip('python3 lipsește');
  const r = run([]);
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /^ok$/m);
});

test('scene: un manifest stricat este respins (dovadă negativă)', (t) => {
  if (!hasPython()) return t.skip('python3 lipsește');
  const good = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const dir = mkdtempSync(join(tmpdir(), 'scene-manifest-'));
  try {
    const cases = {
      'extensie .pt': (m) => { m.models[0].files[0].path = 'model.pt'; },
      'cale cu ..': (m) => { m.models[0].files[0].path = '../model.safetensors'; },
      'sha256 greșit': (m) => { m.models[0].files[0].sha256 = 'zz'; },
      'remote code .py': (m) => { m.models[0].files[1].path = 'birefnet.py'; },
    };
    // control pozitiv: manifestul nemodificat trece prin același mod de rulare
    const okPath = join(dir, 'ok.json');
    writeFileSync(okPath, JSON.stringify(good));
    assert.equal(run(['--manifest', okPath]).status, 0);
    for (const [label, mutate] of Object.entries(cases)) {
      const m = structuredClone(good);
      mutate(m);
      const p = join(dir, 'bad.json');
      writeFileSync(p, JSON.stringify(m));
      const r = run(['--manifest', p]);
      assert.notEqual(r.status, 0, `manifestul stricat (${label}) a trecut`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
