import { defineCollection, z } from 'astro:content';
import { CATEGORY_KEYS, INDUSTRY_KEYS } from '../lib/catalog-taxonomy';

// Fișierele din src/content/products/ sunt generate de scripts/catalog/assemble_*.py.
// Nu se editează de mână: textele se schimbă în catalog/texts/, faptele vin din feed-ul furnizorului.
// Build-ul pică dacă lipsește un câmp obligatoriu.
const httpsUrl = z.string().url().startsWith('https://');
// Imagini găzduite de noi (scripts/catalog/fetch_images_mascot.py) sau, temporar, URL https din feed.
const localImage = z.string().regex(/^\/images\/products\/[a-z0-9-]+\/[A-Za-z0-9_-]+\.webp$/);
const media = z.union([localImage, httpsUrl]);

const products = defineCollection({
  type: 'data',
  schema: z.object({
    status: z.enum(['draft', 'review', 'published']),
    name: z.string().min(5),
    category: z.enum(CATEGORY_KEYS),
    industries: z.array(z.enum(INDUSTRY_KEYS)).min(1),
    summary: z.string().min(60).max(220),
    description: z.array(z.string().min(40)).min(1),
    benefits: z.array(z.string()).min(3).max(7),
    specs: z.array(z.object({ label: z.string(), value: z.string() })).min(3),
    notes: z.array(z.string()).default([]),
    certifications: z.array(z.object({ code: z.string(), label: z.string().nullable() })),
    care: z.array(z.string()),
    colours: z
      .array(
        z.object({
          code: z.string(),
          name: z.string(),
          swatch: media.nullable(),
          images: z.array(z.object({ src: media, thumb: media, view: z.string() })).min(1),
          // Cadrele 360° (P01–P24) pentru culoarea principală; folosite de viewer-ul 360° (I-2026-11-11-01).
          spin: z.array(media).default([]),
        }),
      )
      .min(1),
    otherColoursCount: z.number().int().min(0),
    sizes: z.object({
      summary: z.string(),
      values: z.array(z.string()).min(1),
      table: z.array(
        z.object({ size: z.string(), measure: z.string().nullable(), leg: z.string().nullable().optional() }),
      ),
      note: z.string().nullable(),
    }),
    personalization: z
      .object({
        placements: z.array(z.object({ position: z.string(), maxSize: z.string().nullable() })),
        special: z.boolean(),
        hiVisNote: z.string().nullable(),
      })
      .nullable(),
    documents: z.array(
      z.object({
        type: z.enum(['fisa-tehnica', 'declaratie-conformitate']),
        label: z.string(),
        url: httpsUrl,
        language: z.string(),
      }),
    ),
    faq: z.array(z.object({ q: z.string().endsWith('?'), a: z.string() })).min(3).max(6),
    seo: z.object({
      // BaseLayout adaugă „ | You Protect” (14 caractere) la titlu.
      title: z.string().max(50),
      description: z.string().min(70).max(160),
    }),
    supplier: z.object({
      name: z.enum(['MASCOT', 'Sir Safety', 'Portwest']),
      brand: z.string(),
      model: z.string(),
      range: z.string().nullable(),
      productUrl: httpsUrl.nullable(),
    }),
    reviewNotes: z.array(z.string()).default([]),
    source: z.object({ feed: z.string(), assembledAt: z.string() }),
  }),
});

export const collections = { products };
