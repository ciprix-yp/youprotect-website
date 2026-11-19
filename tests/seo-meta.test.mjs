// Limitele pentru titlurile și descrierile din Google: scripts/seo/check-meta.mjs (rulează în CI pe dist/).
import assert from 'node:assert/strict';
import test from 'node:test';
import { auditMeta, readMeta, TITLE_MAX, DESCRIPTION_MAX } from '../scripts/seo/check-meta.mjs';

const desc = (n) => 'd'.repeat(n);

test('readMeta citește titlul și descrierea și decodează entitățile', () => {
  const html = '<title>S1P &amp; S3 | You Protect</title><meta name="description" content="Ce înseamnă &quot;S3&quot;">';
  assert.deepEqual(readMeta(html), { title: 'S1P & S3 | You Protect', description: 'Ce înseamnă "S3"' });
});

test('readMeta sare peste paginile cu noindex', () => {
  assert.equal(readMeta('<meta name="robots" content="noindex, nofollow"><title>Preview</title>'), null);
});

test('auditMeta acceptă limitele exacte și numără diacriticele ca un caracter', () => {
  const title = 'ț'.repeat(TITLE_MAX);
  assert.deepEqual(auditMeta([{ url: '/a/', title, description: desc(DESCRIPTION_MAX) }]), []);
});

test('auditMeta semnalează titlu lung, descriere scurtă sau lungă, lipsă și duplicate', () => {
  const problems = auditMeta([
    { url: '/lung/', title: 't'.repeat(TITLE_MAX + 1), description: desc(100) },
    { url: '/scurt/', title: 'Scurt', description: desc(69) },
    { url: '/lunga/', title: 'Lunga', description: desc(DESCRIPTION_MAX + 1) },
    { url: '/fara/', title: null, description: null },
    { url: '/dublura/', title: 'Scurt', description: desc(100) },
  ]);
  assert.equal(problems.length, 7);
  assert.match(problems.join('\n'), /\/lung\/: titlul are 65/);
  assert.match(problems.join('\n'), /\/dublura\/: titlul e la fel ca pe \/scurt\//);
  assert.match(problems.join('\n'), /\/dublura\/: descrierea e la fel ca pe \/lung\//);
});
