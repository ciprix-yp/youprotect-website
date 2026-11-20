// scripts/check-inline-scripts.mjs: scripturile de pe fiecare pagină trebuie să rămână în pagină (tranziția dintre
// pagini e sărită când rulează din fișier separat), iar astro.config.mjs le cere în pagină.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auditScripts, externalModuleScripts } from '../scripts/check-inline-scripts.mjs';
import { inlineLayoutScripts } from '../astro.config.mjs';

test('scripturile externe nepermise sunt raportate; Astro prefetch și /confirmare/ sunt permise', () => {
  const html = (...srcs) => `<head></head><body><script type="module">inline()</script>${srcs.map((s) => `<script type="module" src="${s}"></script>`).join('')}</body>`;
  assert.deepEqual(externalModuleScripts(html('/_astro/page.B3sWyS9n.js')), ['/_astro/page.B3sWyS9n.js']);
  assert.deepEqual(auditScripts([{ url: '/', html: html('/_astro/page.B3sWyS9n.js') }]), []);
  assert.deepEqual(
    auditScripts([{ url: '/confirmare/', html: html('/_astro/confirmare.astro_astro_type_script_index_0_lang.Bb-Y5uzi.js') }]),
    [],
  );
  assert.deepEqual(auditScripts([{ url: '/produse/', html: html('/_astro/BaseLayout.astro_astro_type_script_index_0_lang.C5.js') }]), [
    '/produse/: script extern /_astro/BaseLayout.astro_astro_type_script_index_0_lang.C5.js',
  ]);
});

test('astro.config: scripturile din BaseLayout, Header, Footer și Analytics stau în pagină; restul, limita implicită', () => {
  assert.equal(inlineLayoutScripts('_astro/BaseLayout.astro_astro_type_script_index_0_lang.C5.js'), true);
  assert.equal(inlineLayoutScripts('_astro/Analytics.astro_astro_type_script_index_0_lang.X.js'), true);
  assert.equal(inlineLayoutScripts('_astro/MultiStepForm.BYVh2U8l.js'), undefined);
  assert.equal(inlineLayoutScripts('_astro/BaseLayout.CBZVECdV.css'), undefined);
  assert.equal(inlineLayoutScripts('_astro/montserrat-latin-400-normal.woff2'), undefined);
});
