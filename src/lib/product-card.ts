// Datele unui card de produs, aceleași în catalog, pe paginile de categorie și pe cele de marcă.
import { cardImage, cardSrc, packshotImage } from './catalog-images.js';
import { CATEGORIES, type CategoryKey } from './catalog-taxonomy.ts';

export interface CardEntry {
  id: string;
  data: {
    name: string;
    category: CategoryKey;
    supplier: { brand: string };
    certifications: { code: string }[];
    cardColour?: string | null;
    colours: { code?: string; images: { src: string; kind?: 'packshot' | 'studio' | 'scena'; focus?: string; alt?: string }[] }[];
  };
}

export interface CardProps {
  slug: string;
  name: string;
  brand: string;
  categoryName: string;
  /** Standardul principal, așa cum îl declară producătorul („EN ISO 20345:2022 S3S”), sau null. */
  spec: string | null;
  /** Poza cardului (omul care poartă produsul, dacă există și e eligibilă; altfel packshot), varianta de 600 px. */
  image: string;
  /** Tipul pozei cardului: packshot, studio sau scena. */
  imageKind: 'packshot' | 'studio' | 'scena';
  /** Textul alternativ propriu al pozei pe model (descrie produsul purtat) sau null: atunci cardul folosește numele. */
  imageAlt: string | null;
  /** Packshot-ul culorii principale, varianta de 600 px, pentru dalele de categorie (care rămân pe packshot). */
  packshot: string;
}

export function toCardProps(entry: CardEntry): CardProps {
  const { data } = entry;
  const photo = cardImage(data);
  return {
    slug: entry.id,
    name: data.name,
    brand: data.supplier.brand.replace('®', ''),
    categoryName: CATEGORIES[data.category],
    spec: (data.certifications.find((c) => /^(EN|ISO|IEC)\b/.test(c.code)) ?? data.certifications[0])?.code ?? null,
    image: cardSrc(photo.src),
    imageKind: photo.kind,
    imageAlt: photo.alt,
    packshot: cardSrc(packshotImage(data).src),
  };
}
