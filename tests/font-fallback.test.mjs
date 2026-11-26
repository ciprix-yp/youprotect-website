// Fonturile de rezervă cu metrici potrivite (global.css): fără ele, la swap titlul își schimbă numărul de rânduri și butoanele sar.
// Verificăm doar structura: fiecare familie de rezervă are fețe cu size-adjust și override-uri, iar stivele de fonturi o includ
// imediat după fontul real, înaintea fallback-ului generic.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/styles/global.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const tw = readFileSync(new URL('../tailwind.config.mjs', import.meta.url), 'utf8');
const faces = css.match(/@font-face\s*\{[^}]*\}/g) ?? [];

for (const family of ['Montserrat Fallback', 'YP Text Fallback']) {
  test(`${family}: fețe locale cu size-adjust și override-uri de metrici`, () => {
    const mine = faces.filter((f) => f.includes(`"${family}"`));
    assert.ok(mine.length >= 2, `${family}: lipsesc fețele @font-face`);
    for (const f of mine) {
      assert.match(f, /src:\s*local\(/, `${family}: sursa trebuie să fie locală (fără fișiere noi)`);
      assert.doesNotMatch(f, /url\(/, `${family}: fără url() (ar adăuga o cerere)`);
      for (const p of ['size-adjust', 'ascent-override', 'descent-override', 'line-gap-override']) assert.match(f, new RegExp(`${p}:\\s*[\\d.]+%`), `${family}: lipsește ${p}`);
    }
  });
}

test('stivele de fonturi pun fallback-ul potrivit după fontul real', () => {
  assert.match(css, /font-family:\s*'YP Text',\s*'YP Text Fallback',\s*sans-serif/);
  assert.match(css, /font-family:\s*'Montserrat',\s*'Montserrat Fallback',\s*sans-serif/);
  assert.match(tw, /'heading':\s*\['Montserrat',\s*'"Montserrat Fallback"'/);
  assert.match(tw, /'body':\s*\['"YP Text"',\s*'"YP Text Fallback"'/);
});
