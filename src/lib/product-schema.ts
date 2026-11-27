import { z } from 'astro/zod';
import { CATEGORY_KEYS, INDUSTRY_KEYS } from './catalog-taxonomy.ts';

// Schema fișierelor din src/content/products/, generate de scripts/catalog/assemble_*.py.
// Nu se editează de mână: textele se schimbă în catalog/texts/, faptele vin din feed-ul furnizorului.
// Build-ul pică dacă lipsește un câmp obligatoriu. E într-un modul separat (nu în src/content.config.ts, care
// importă „astro:content”) ca testele Node să poată rula schema pe date sintetice (tests/catalog-cards.test.mjs).
const httpsUrl = z.url({ protocol: /^https$/ });
// Imagini găzduite de noi (scripts/catalog/fetch_images_mascot.py) sau, temporar, URL https din feed.
const localImage = z.string().regex(/^\/images\/products\/[a-z0-9-]+\/[A-Za-z0-9_-]+\.webp$/);
// Documente găzduite de noi: declarațiile în română din portalul B2B Sir Safety (fetch_declarations_sirsafety.py).
const localDocument = z.string().regex(/^\/documente\/[a-z0-9-]+\/[a-z0-9-]+\.pdf$/);
const media = z.union([localImage, httpsUrl]);
// Poza pe model: packshot (produsul singur), studio (omul pe fond alb) sau scenă (omul la lucru).
// `focus` = punctul important al pozei, „X% Y%” din lățime și înălțime; la scenă, decupajul 4:5 al cardului
// se face după el (scripts/catalog/card-layout.mjs), de aceea e obligatoriu la scenă.
const photoKind = z.enum(['packshot', 'studio', 'scena']);
const focus = z.string().regex(/^\d{1,3}% \d{1,3}%$/);

export const productSchema = z
  .object({
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
          // Valorile implicite țin valide JSON-urile generate înainte de poza pe model (kind = packshot, fără focus/alt).
          images: z
            .array(
              z.object({
                src: media,
                thumb: media,
                view: z.string(),
                kind: photoKind.default('packshot'),
                focus: focus.optional(),
                alt: z.string().min(10).max(200).optional(),
              }),
            )
            .min(1),
          // Cadrele 360° (P01–P24) pentru viewer-ul 360° (idee, I-2026-11-11-01). Goale din 20.11.2026: nicio pagină nu le
          // folosea; fetch_images_mascot.py --spin le descarcă din nou dacă facem viewer-ul.
          spin: z.array(media).default([]),
        }),
      )
      .min(1),
    // Codul culorii a cărei primă poză apare pe card și în fișă (cardPhoto din catalog/texts/); null = colours[0].
    // Ordinea din colours[] nu se schimbă niciodată. Rezolvarea: cardColour/cardImage din src/lib/catalog-images.js.
    cardColour: z.string().nullable().default(null),
    otherColoursCount: z.number().int().min(0),
    // „Testare fără riscuri” se aplică produsului (src/lib/risk-free-scope.ts); false la căști, ochelari, viziere,
    // antifoane și mănuși electroizolante.
    riskFreeTesting: z.boolean().default(true),
    sizes: z.object({
      summary: z.string(),
      values: z.array(z.string()).min(1),
      table: z.array(
        z.object({ size: z.string(), measure: z.string().nullable(), leg: z.string().nullable().optional() }),
      ),
      note: z.string().nullable(),
    }),
    // Variantele aceleiași linii pe o singură fișă (croieli de cămașă, tipuri de guler), fiecare cu codul ei de la
    // producător. Mărimile și culorile vin din feed, pe fiecare cod (assemble_mascot.py).
    variants: z
      .object({
        title: z.string(),
        items: z
          .array(z.object({ label: z.string(), model: z.string(), sizes: z.string(), colours: z.array(z.string()).min(1) }))
          .min(2),
      })
      .nullable()
      .default(null),
    personalization: z
      .object({
        placements: z.array(z.object({ position: z.string(), maxSize: z.string().nullable() })),
        special: z.boolean(),
        hiVisNote: z.string().nullable(),
      })
      .nullable(),
    documents: z.array(
      z.object({
        // declaratie-corespondenta: Sir Safety pentru produsele fabricate de alții, cu declarația UE a producătorului.
        type: z.enum(['fisa-tehnica', 'declaratie-conformitate', 'declaratie-corespondenta']),
        label: z.string(),
        url: z.union([httpsUrl, localDocument]),
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
  })
  .superRefine((data, ctx) => {
    // Poza pe model: culoarea cardului trebuie să existe în colours[] și să aibă pe prima poziție o poză cu omul
    // (assemble_*.py o pune acolo). Altfel cardul ar rămâne tăcut pe packshot.
    if (data.cardColour !== null) {
      const colour = data.colours.find((c) => c.code === data.cardColour);
      if (!colour) {
        ctx.addIssue({ code: 'custom', path: ['cardColour'], message: `cardColour „${data.cardColour}” nu există în colours[]` });
      } else if (colour.images[0].kind === 'packshot') {
        ctx.addIssue({ code: 'custom', path: ['cardColour'], message: `prima poză a culorii „${data.cardColour}” trebuie să fie studio sau scenă` });
      }
    }
    data.colours.forEach((colour, ci) =>
      colour.images.forEach((image, ii) => {
        if (image.kind === 'scena' && !image.focus) {
          ctx.addIssue({ code: 'custom', path: ['colours', ci, 'images', ii, 'focus'], message: 'poza de tip scenă cere focus („X% Y%”)' });
        }
      }),
    );
  });
