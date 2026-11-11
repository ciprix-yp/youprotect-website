// Testimoniale (recenzii Google) afișate pe homepage. Sursa: src/data/testimonials.json.
// Secțiunea apare doar când există cel puțin un testimonial publicat.
import data from '../data/testimonials.json';

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

export const publishedTestimonials: Testimonial[] = (data as Testimonial[])
  .filter((t) => t.status === 'published')
  .sort((a, b) => (b.date_posted ?? '').localeCompare(a.date_posted ?? ''));
