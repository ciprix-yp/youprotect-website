// Orice frază de pe site care promite „banii înapoi” trebuie să spună și condițiile (D-2026-11-18-03): rambursarea se
// face pe fiecare rol și doar dacă produsele nu ies mai eficiente ȘI clientul nu e mulțumit.
// Pe 18.11.2026 homepage-ul încă spunea „cu banii înapoi dacă nu iese mai eficient”, fără celelalte două condiții.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(ROOT, 'src');
const EXTENSIONS = /\.(astro|ts|tsx|js|mjs|jsx|md|mdx|json)$/;
const CLAIM = /ban(ii|ilor)\s+înapoi/i;

function filesUnder(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return filesUnder(path);
    return EXTENSIONS.test(entry.name) ? [path] : [];
  });
}

/** Frazele care promit banii înapoi fără „rol” și fără „mulțumit”. Titlurile (h1–h6) și comentariile nu sunt promisiuni. */
export function unconditionedRefundClaims(source) {
  const text = source
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ')
    .replace(/<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');
  return text
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => CLAIM.test(sentence))
    .filter((sentence) => !(/mulțumit/i.test(sentence) && /\brol/i.test(sentence)))
    .map((sentence) => sentence.trim().slice(0, 200));
}

test('garanție: verificarea prinde promisiunea fără condiții', () => {
  assert.equal(unconditionedRefundClaims('<p>Testare de 90 de zile, cu banii înapoi dacă nu iese mai eficient</p>').length, 1);
  assert.equal(unconditionedRefundClaims('Dacă nu ies mai eficiente și nu ești mulțumit, îți dăm banii înapoi.').length, 1);
  assert.equal(
    unconditionedRefundClaims('Pe rolurile unde nu ies mai eficiente și nu ești mulțumit, îți dăm banii înapoi.').length,
    0,
  );
  assert.equal(unconditionedRefundClaims('<h2>Când îți dăm banii înapoi</h2>').length, 0);
});

test('garanție: nicio pagină nu promite banii înapoi fără condiții', () => {
  const found = filesUnder(SRC).flatMap((file) =>
    unconditionedRefundClaims(readFileSync(file, 'utf8')).map((s) => `${relative(ROOT, file)}: ${s}`),
  );
  assert.deepEqual(found, []);
});
