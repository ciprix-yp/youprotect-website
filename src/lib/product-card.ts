// Datele unui card de produs, aceleași în catalog, pe paginile de categorie și pe cele de marcă.
import { cardSrc } from './catalog-images.js';
import { CATEGORIES, type CategoryKey } from './catalog-taxonomy.ts';

export interface CardEntry {
  id: string;
  data: {
    name: string;
    category: CategoryKey;
    supplier: { brand: string };
    certifications: { code: string }[];
    colours: { images: { src: string }[] }[];
  };
}

export interface CardProps {
  slug: string;
  name: string;
  brand: string;
  categoryName: string;
  /** Standardul principal, așa cum îl declară producătorul („EN ISO 20345:2022 S3S”), sau null. */
  spec: string | null;
  image: string;
}

export function toCardProps(entry: CardEntry): CardProps {
  const { data } = entry;
  return {
    slug: entry.id,
    name: data.name,
    brand: data.supplier.brand.replace('®', ''),
    categoryName: CATEGORIES[data.category],
    spec: (data.certifications.find((c) => /^(EN|ISO|IEC)\b/.test(c.code)) ?? data.certifications[0])?.code ?? null,
    image: cardSrc(data.colours[0].images[0].src),
  };
}
