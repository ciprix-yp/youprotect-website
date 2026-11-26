// Caruselul de recenzii (src/components/**/Testimonials.astro) nu mai derulează singur (ii5, review design 26.11.2026):
// WCAG 2.2.2 + feedback de design. Rămâne un rând cu scroll-snap, derulat de vizitator (deget, săgeți, tastatură).
// Testul pică dacă reapare derularea automată sau dacă săgețile pierd eticheta / ținta de 44 px.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const COMPONENTS = fileURLToPath(new URL('../src/components/', import.meta.url));

function testimonialFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return testimonialFiles(p);
    return name === 'Testimonials.astro' ? [p] : [];
  });
}

const files = testimonialFiles(COMPONENTS);

test('există cel puțin un Testimonials.astro', () => {
  assert.ok(files.length >= 1);
});

for (const file of files) {
  const src = readFileSync(file, 'utf8');

  test(`${file.replace(COMPONENTS, '')}: fără derulare automată`, () => {
    assert.doesNotMatch(src, /setInterval|INTERVAL_MS/);
    assert.doesNotMatch(src, /carousel-pause|autoplay/i);
  });

  test(`${file.replace(COMPONENTS, '')}: săgeți cu aria-label în română, ținta de 44 px`, () => {
    const buttons = [...src.matchAll(/<button\b[\s\S]*?>/g)].map((m) => m[0]);
    assert.ok(buttons.length >= 2, 'săgeata anterioară și cea următoare');
    for (const b of buttons) {
      assert.match(b, /aria-label="[^"]+"/, 'buton fără aria-label');
      assert.match(b, /min-h-11/, 'buton sub 44 px (min-h-11)');
      assert.match(b, /min-w-11/, 'buton sub 44 px (min-w-11)');
    }
    assert.match(src, /aria-label="Recenzia anterioară"/);
    assert.match(src, /aria-label="Recenzia următoare"/);
  });

  test(`${file.replace(COMPONENTS, '')}: rândul are scroll-snap, focus de la tastatură și derulare instant cu reduce motion`, () => {
    assert.match(src, /snap-x/);
    assert.match(src, /tabindex="0"/);
    assert.match(src, /role="region"/);
    assert.match(src, /prefers-reduced-motion: reduce/);
    assert.match(src, /behavior: reduce\.matches \? 'auto' : 'smooth'/);
    assert.match(src, /ArrowRight/);
    assert.match(src, /ArrowLeft/);
  });
}
