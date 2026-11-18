// Recenziile Google (Places API, varianta nouă) transformate în testimoniale pentru homepage.
// Folosit la build de scripts/fetch-google-reviews.mjs și de src/lib/testimonials.ts. Fără dependențe, testat în
// tests/google-reviews.test.mjs. Reguli (Ciprian, 18.11.2026): doar 4 și 5 stele; D-2026-11-17-02: fără poze de profil,
// numele ca „Prenume I.”, textul neschimbat.
import { createHash } from 'node:crypto';

export const MIN_RATING = 4;
export const YOU_PROTECT_PLACE_ID = 'ChIJzczeE0MFOEcRMBTA9E1R9eY';

/** „Camelia Laza” -> „Camelia L.”; un singur nume rămâne cum e. */
export function shortName(displayName) {
  const parts = String(displayName ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Client Google';
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

const bucharestDate = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? null
    : new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
};

/** Răspunsul Places API (câmpul `reviews`) -> testimoniale publicate, doar 4–5 stele și cu text. */
export function mapPlacesReviews(reviews) {
  if (!Array.isArray(reviews)) return [];
  return reviews
    .filter((r) => Number.isInteger(r?.rating) && r.rating >= MIN_RATING && r.rating <= 5)
    .map((r) => {
      const text = (r.originalText?.text ?? r.text?.text ?? '').trim();
      const googleId = typeof r.name === 'string' ? r.name.slice(0, 300) : null;
      return {
        id: createHash('sha256').update(googleId ?? `${r.authorAttribution?.displayName}|${text}`).digest('hex').slice(0, 32),
        google_review_id: googleId,
        author_name: shortName(r.authorAttribution?.displayName),
        author_photo_url: null,
        review_text: text.slice(0, 2000),
        rating: r.rating,
        date_posted: r.publishTime ? bucharestDate(r.publishTime) : null,
        status: 'published',
      };
    })
    .filter((t) => t.review_text.length > 0);
}

// Aceeași recenzie poate veni cu ID-uri diferite (API-ul vechi folosea timestamp-ul): comparăm autorul și textul.
const sameKey = (t) =>
  `${t.author_name}|${String(t.review_text).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '').slice(0, 80)}`;

/** Recenziile din repo (sursa de bază) plus cele noi de pe Google, fără dubluri. */
export function mergeTestimonials(seed, fetched) {
  const seen = new Set(seed.map(sameKey));
  return [...seed, ...fetched.filter((t) => !seen.has(sameKey(t)) && seen.add(sameKey(t)))];
}
