// Pipeline-ul de scene (scripts/scene): contexte permise și constructorul de prompt.
// Logica e în tests/py/scene_prompting_check.py (doar stdlib, `python3 -I`); fără modele; sare dacă nu există python3.
// Include dovezi negative: contexte interzise (drum rapid, cale ferată, noapte, sudură activă), context inexistent,
// cuvinte interzise injectate, iar CLI-ul iese cu cod 1 pe un contexte.json stricat.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = join(ROOT, 'tests/py/scene_prompting_check.py');
const CLI = join(ROOT, 'scripts/scene/prompting.py');
const CONTEXTE = join(ROOT, 'scripts/scene/contexte.json');
const hasPython = () => spawnSync('python3', ['-I', '-c', 'import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)']).status === 0;

test('scene prompting: contexte permise, respinse și cuvinte interzise (pozitiv și negativ)', (t) => {
  if (!hasPython()) return t.skip('python3 lipsește');
  const r = spawnSync('python3', ['-I', CHECK, ROOT], { cwd: ROOT, encoding: 'utf8', timeout: 60_000 });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /^ok$/m);
  for (const needle of [
    'POS vestă + șantier ziua',
    'POS bocanc + noroi',
    'NEG clasa 2 + drum rapid',
    'NEG clasa 2 + cale ferată',
    'NEG clasa 2 + noapte',
    'NEG 11611 clasa 1 + sudură activă',
    'NEG context inexistent',
    'NEG cuvânt interzis în decor: worker',
    'NEG cuvânt interzis în decor: muncitor',
    'NEG validate_contexte semnalează contextul stricat',
    'POS standardele din contexte.json apar în fișele de catalog',
  ]) {
    assert.ok(r.stdout.includes(needle), `testul "${needle}" nu a rulat`);
  }
});

test('scene prompting CLI: iese 0 pe contexte.json valid și 1 pe unul stricat', (t) => {
  if (!hasPython()) return t.skip('python3 lipsește');
  const args = ['-I', CLI, '--product', 'S476YE', '--context', 'hala_depozit'];
  const good = spawnSync('python3', args, { encoding: 'utf8', timeout: 30_000 });
  assert.equal(good.status, 0, good.stderr);
  const dir = mkdtempSync(join(tmpdir(), 'scene-prompt-'));
  try {
    const data = JSON.parse(readFileSync(CONTEXTE, 'utf8'));
    data.contexte.find((c) => c.id === 'hala_depozit').decor += ' A worker walks by.';
    const bad = join(dir, 'contexte.json');
    writeFileSync(bad, JSON.stringify(data));
    const r = spawnSync('python3', [...args, '--contexte', bad], { encoding: 'utf8', timeout: 30_000 });
    assert.equal(r.status, 1, `${r.stdout}\n${r.stderr}`);
    assert.match(r.stderr, /cuvinte interzise/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
