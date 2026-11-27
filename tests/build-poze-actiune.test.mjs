// Scriptul de imagini scripts/images/build-poze-actiune.py: decupajul portret 4:5 se ia din ORIGINALUL ÎNTREG, independent
// de `decupaj` (desktop 16:9). Verificarea rulează în Python (Pillow) pe o imagine sintetică mică: tests/py/portret_crop_check.py.
// Se rulează cu `uv run --with pillow==13.0.0` sau cu python3 dacă are deja Pillow; fără niciuna (ex. CI doar cu Node) testul sare.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const check = (name) => join(ROOT, 'tests/py', name);
const run = (cmd, args) => spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', timeout: 120_000 });

/** Comanda (și argumentele dinaintea scriptului) care rulează Python cu Pillow, sau null. */
function pythonWithPillow() {
  const py = run('python3', ['-I', '-c', 'import PIL']);
  if (py.status === 0) return ['python3', ['-I']];
  const uv = run('uv', ['--version']);
  if (uv.status === 0) return ['uv', ['run', '--no-project', '--with', 'pillow==13.0.0', 'python', '-I']];
  const viaMise = run('mise', ['exec', 'uv@0.13.6', '--', 'uv', '--version']);
  if (viaMise.status === 0) return ['mise', ['exec', 'uv@0.13.6', '--', 'uv', 'run', '--no-project', '--with', 'pillow==13.0.0', 'python', '-I']];
  return null;
}

function runPython(t, script) {
  const cmd = pythonWithPillow();
  if (!cmd) return t.skip('nici python3 cu Pillow, nici uv: verificarea pe imagine sintetică sare');
  const r = run(cmd[0], [...cmd[1], check(script), ROOT]);
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /^ok$/m);
}

test('scriptul de imagini: portret.decupaj e relativ la originalul întreg (nu la decupajul de desktop)', (t) => {
  const src = readFileSync(join(ROOT, 'scripts/images/build-poze-actiune.py'), 'utf8');
  assert.match(src, /portrait_crop\(full, entry\["portret"\]/, 'main() trebuie să dea portrait_crop imaginea întreagă');
  assert.ok(!/portrait_crop\(src,/.test(src), 'portrait_crop pe imaginea decupată pentru desktop');
  runPython(t, 'portret_crop_check.py');
});

test('scripturile de imagini: --only prelucrează doar id-urile cerute și le unește în fișierele existente (variante, efectiv.json)', (t) => {
  for (const f of ['build-poze-actiune.py', 'fetch-poze-actiune.py']) {
    assert.match(readFileSync(join(ROOT, 'scripts/images', f), 'utf8'), /--only/, `${f}: fără opțiunea --only`);
  }
  runPython(t, 'only_check.py');
});
