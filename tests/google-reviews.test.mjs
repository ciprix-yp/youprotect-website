import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapPlacesReviews, mergeTestimonials, shortName } from '../src/lib/google-reviews.js';

const review = (over = {}) => ({
  name: 'places/X/reviews/abc',
  rating: 5,
  originalText: { text: 'Produse foarte bune!', languageCode: 'ro' },
  text: { text: 'Very good products!', languageCode: 'en' },
  authorAttribution: { displayName: 'Ion Vasile Popescu', photoUri: 'https://lh3.googleusercontent.com/x' },
  publishTime: '2026-10-31T23:30:00Z',
  ...over,
});

test('recenzii: doar 4–5 stele, cu text, fără poză, nume scurt, text original, dată în ora României', () => {
  const out = mapPlacesReviews([
    review(),
    review({ name: 'places/X/reviews/b', rating: 4 }),
    review({ name: 'places/X/reviews/c', rating: 3 }),
    review({ name: 'places/X/reviews/d', rating: 5, originalText: undefined, text: { text: '   ' } }),
    review({ name: 'places/X/reviews/e', rating: '5' }),
  ]);
  assert.equal(out.length, 2);
  assert.equal(out[0].author_name, 'Ion P.');
  assert.equal(out[0].author_photo_url, null);
  assert.equal(out[0].review_text, 'Produse foarte bune!');
  assert.equal(out[0].date_posted, '2026-11-01'); // 23:30 UTC = 01:30 în România
  assert.equal(out[0].status, 'published');
  assert.deepEqual(mapPlacesReviews(undefined), []);
});

test('recenzii: nume', () => {
  assert.equal(shortName('Camelia Laza'), 'Camelia L.');
  assert.equal(shortName('Mihai'), 'Mihai');
  assert.equal(shortName(''), 'Client Google');
});

test('recenzii: fără dubluri față de cele din repo', () => {
  const seed = [{ ...mapPlacesReviews([review()])[0], id: 'vechi', google_review_id: '1766350562' }];
  const fetched = mapPlacesReviews([review(), review({ name: 'places/X/reviews/n', originalText: { text: 'Altă recenzie' } })]);
  const merged = mergeTestimonials(seed, fetched);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].id, 'vechi');
});
