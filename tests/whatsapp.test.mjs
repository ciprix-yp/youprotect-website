// Butonul și linkul WhatsApp sunt pe fiecare pagină (owner, 20.11.2026): în Footer, care apare pe toate paginile prin
// BaseLayout, cu adresa paginii în mesajul precompletat.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { whatsappHref, WHATSAPP_NUMBER } from '../src/lib/whatsapp.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

test('whatsapp: numărul firmei, cu adresa paginii în mesaj', () => {
  assert.equal(WHATSAPP_NUMBER, '40742226127');
  const href = whatsappHref('/produse/manusi-de-protectie/');
  assert.match(href, /^https:\/\/wa\.me\/40742226127\?text=/);
  assert.match(decodeURIComponent(href.split('text=')[1]), /https:\/\/youprotect\.ro\/produse\/manusi-de-protectie\//);
  assert.doesNotMatch(decodeURIComponent(whatsappHref('/').split('text=')[1]), /https:/);
});

test('whatsapp: footer-ul are butonul fix și linkul din contact, iar BaseLayout include footer-ul', () => {
  const footer = readFileSync(`${ROOT}src/components/global/Footer.astro`, 'utf8');
  assert.match(footer, /whatsappHref\(Astro\.url\.pathname\)/);
  assert.equal((footer.match(/href=\{waHref\}/g) ?? []).length, 2, 'butonul fix + linkul din contact');
  assert.match(readFileSync(`${ROOT}src/layouts/BaseLayout.astro`, 'utf8'), /<Footer \/>/);
});
