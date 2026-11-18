// Preia recenziile You Protect de pe Google (Places API) și le scrie în src/data/testimonials.google.json (ignorat de
// git), de unde le citește homepage-ul alături de src/data/testimonials.json. Rulează la fiecare build, din integrarea
// „recenzii-google” din astro.config.mjs (deci indiferent de comanda de build), sau manual: node scripts/fetch-google-reviews.mjs
// Fără cheie (local, CI) sau dacă Google nu răspunde, build-ul continuă cu recenziile din repo. Cheia nu se afișează.
// Cheia: GOOGLE_PLACES_API_KEY (Keychain: secret set youprotect-website GOOGLE_PLACES_API_KEY; producție: Cloudflare Pages).
// Lunar, .github/workflows/recenzii-lunar.yml pornește un build nou, deci recenziile se reîmprospătează.
import { rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { mapPlacesReviews, YOU_PROTECT_PLACE_ID } from '../src/lib/google-reviews.js';

const OUT = new URL('../src/data/testimonials.google.json', import.meta.url);

/** @returns {Promise<string>} un rând de jurnal, fără date sensibile */
export async function fetchGoogleReviews(env = process.env) {
  rmSync(OUT, { force: true });
  const key = env.GOOGLE_PLACES_API_KEY;
  const placeId = env.GOOGLE_PLACE_ID || YOU_PROTECT_PLACE_ID;
  if (!key) return 'GOOGLE_PLACES_API_KEY lipsește: rămân recenziile din src/data/testimonials.json.';
  if (!/^[A-Za-z0-9_-]{10,300}$/.test(placeId)) return 'GOOGLE_PLACE_ID nu e valid: rămân recenziile din repo.';
  try {
    const res = await fetch(`https://places.googleapis.com/v1/places/${placeId}?languageCode=ro`, {
      headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'reviews' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Google a răspuns HTTP ${res.status}`);
    const data = await res.json();
    const reviews = mapPlacesReviews(data.reviews);
    writeFileSync(OUT, `${JSON.stringify(reviews, null, 2)}\n`);
    const n = reviews.length;
    const count = n === 1 ? 'O recenzie' : n % 100 === 0 || n % 100 >= 20 ? `${n} de recenzii` : `${n} recenzii`;
    return `${count} de 4–5 stele ${n === 1 ? 'preluată' : 'preluate'} de pe Google (din ${data.reviews?.length ?? 0}).`;
  } catch (error) {
    return `Preluarea a eșuat (${error.message}); rămân recenziile din src/data/testimonials.json.`;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(`[recenzii] ${await fetchGoogleReviews()}`);
}
