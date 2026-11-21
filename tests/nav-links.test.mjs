// Linkurile interne din meniu și din footer duc la pagini care există (21.11.2026: „Contact” în meniu, odată cu
// pagina /contact/).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pageExists } from './site-routes.js';

const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
const internalLinks = (src) =>
  [...src.matchAll(/href(?:=|:\s*)["']([^"'#?]+)["']/g)].map((m) => m[1]).filter((h) => h.startsWith('/'));

test('meniu și footer: fiecare link intern duce la o pagină', () => {
  for (const file of ['src/components/global/Header.astro', 'src/components/global/Footer.astro']) {
    const links = internalLinks(read(file));
    assert.ok(links.length > 3, `${file}: nu am găsit linkuri`);
    const missing = links.filter((h) => !/\.[a-z0-9]+$/i.test(h) && !pageExists(h));
    assert.deepEqual(missing, [], file);
  }
});

test('meniu: „Contact” e în meniul principal', () => {
  assert.match(read('src/components/global/Header.astro'), /href: '\/contact\/', label: 'Contact'/);
});
