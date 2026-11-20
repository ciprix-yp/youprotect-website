// Animațiile legate de derulare (global.css, „Mișcare legată de derulare”): minificatorul de la build lipește
// animation-timeline în prescurtarea `animation`, unde browserul nu o acceptă, și toată regula se pierde fără eroare.
// De aceea, o regulă cu animation-timeline trebuie să folosească doar proprietățile separate (animation-name etc.).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/styles/global.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

test('regulile cu animation-timeline nu folosesc prescurtarea animation', () => {
  const rules = css.match(/[^{}]+\{[^{}]*animation-timeline[^{}]*\}/g) ?? [];
  assert.ok(rules.length >= 5, 'animațiile legate de derulare lipsesc din global.css');
  for (const rule of rules) {
    assert.doesNotMatch(rule, /(^|[\s;{])animation\s*:/, `prescurtarea animation lângă animation-timeline:\n${rule.trim()}`);
  }
});
