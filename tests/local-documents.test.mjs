// Documentele găzduite de noi (public/documente/, declarațiile în română din portalul B2B Sir Safety): fiecare link
// din fișele de produs duce la un PDF care există, sub limita de 500 KB din pre-commit, și fiecare PDF e folosit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const products = readdirSync(join(ROOT, 'src/content/products'))
  .filter((n) => n.endsWith('.json'))
  .map((n) => JSON.parse(readFileSync(join(ROOT, 'src/content/products', n), 'utf8')));
const local = products.flatMap((p) => p.documents.filter((d) => d.url.startsWith('/')).map((d) => d.url));

test('documentele locale există, sunt PDF și au sub 500 KB', () => {
  assert.ok(local.length > 0);
  for (const url of local) {
    const file = join(ROOT, 'public', url);
    assert.ok(existsSync(file), `lipsește public${url}`);
    assert.equal(readFileSync(file).subarray(0, 5).toString(), '%PDF-', url);
    assert.ok(statSync(file).size < 500 * 1024, `${url} are peste 500 KB`);
  }
});

test('fiecare PDF din public/documente/ e legat de o fișă de produs', () => {
  const dir = join(ROOT, 'public/documente');
  const files = readdirSync(dir).flatMap((slug) => readdirSync(join(dir, slug)).map((f) => `/documente/${slug}/${f}`));
  assert.deepEqual(files.filter((f) => !local.includes(f)), []);
});
