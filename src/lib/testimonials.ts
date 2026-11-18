// Testimoniale (recenzii Google) afișate pe homepage.
// Surse: src/data/testimonials.json (în repo, sursa de bază) plus src/data/testimonials.google.json, scris la build de
// scripts/fetch-google-reviews.mjs cu recenziile de 4–5 stele de pe Google. Al doilea poate lipsi (fără cheie, local, CI).
// Secțiunea apare doar când există cel puțin un testimonial publicat.
import data from '../data/testimonials.json';
import { mergeTestimonials } from './google-reviews.js';

export interface Testimonial {
  id: string;
  google_review_id: string | null;
  author_name: string;
  author_photo_url: string | null;
  review_text: string;
  rating: number;
  date_posted: string | null;
  status: 'draft' | 'published';
}

const fromGoogle = Object.values(
  import.meta.glob<Testimonial[]>('../data/testimonials.google.json', { eager: true, import: 'default' }),
)[0] ?? [];

export const publishedTestimonials: Testimonial[] = mergeTestimonials(data as Testimonial[], fromGoogle)
  .filter((t) => t.status === 'published')
  .sort((a, b) => (b.date_posted ?? '').localeCompare(a.date_posted ?? ''));
