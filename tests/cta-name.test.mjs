// Decizia owner-ului din 25.11.2026 (D-2026-11-25-02): butonul de discuție se numește „Hai să discutăm” peste tot,
// definit într-un singur loc (CTA_DISCUSS din src/lib/site.ts). Adresa /programeaza-discutie/ rămâne neschimbată.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const files = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : /\.(astro|tsx?|jsx?|mjs|md|mdx)$/.test(name) ? [p] : [];
  });

test('CTA_DISCUSS are valoarea „Hai să discutăm”', () => {
  assert.match(readFileSync(join(ROOT, 'src/lib/site.ts'), 'utf8'), /export const CTA_DISCUSS = "Hai să discutăm";/);
});

test('numele vechi „Programează o discuție” nu mai apare în src/', () => {
  const hits = files(join(ROOT, 'src'))
    .filter((p) => /Programează o discuție/i.test(readFileSync(p, 'utf8')))
    .map((p) => relative(ROOT, p));
  assert.deepEqual(hits, []);
});
