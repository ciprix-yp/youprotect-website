// Cardurile din catalog folosesc o variantă de 600 px a pozei de produs (scripts/catalog/card-images.mjs).
const LOCAL_PRODUCT_IMAGE = /^\/images\/products\/[a-z0-9-]+\/[A-Za-z0-9_-]+\.webp$/;

/** „/images/products/x/09-PS.webp” -> „/images/products/x/09-PS-card.webp”; orice altă cale rămâne neschimbată. */
export function cardSrc(src) {
  if (typeof src !== 'string' || !LOCAL_PRODUCT_IMAGE.test(src) || src.endsWith('-card.webp')) return src;
  return src.replace(/\.webp$/, '-card.webp');
}

/**
 * @typedef {{ src: string, kind?: 'packshot' | 'studio' | 'scena', focus?: string, alt?: string }} CatalogImage
 * @typedef {{ code?: string, images: CatalogImage[] }} CatalogColour
 * @typedef {{ colours: CatalogColour[], cardColour?: string | null }} CatalogProduct
 */

// Poza pe model: `cardColour` (din cardPhoto) alege culoarea al cărei prim imagine e omul care poartă produsul.
// FĂRĂ cardColour rezultatul e cel de dinainte: colours[0].images[0]. Toate locurile care aleg poza cardului sau
// culoarea inițială a fișei trec pe aici (src/lib/product-card.ts, scripts/catalog/card-images.mjs, testele).
// Excepții deliberate, pe PACKSHOT (packshotImage): og:image din src/pages/produse/[slug].astro (nu vrem o scenă tăiată
// în previzualizările de link) și dalele de categorie (CategoryTiles.astro).

/**
 * Culoarea cardului (intrarea din colours[]); colours[0] dacă nu e setat cardColour sau codul nu se găsește
 * (schema pică oricum la un cardColour inexistent, vezi src/lib/product-schema.ts).
 * @param {CatalogProduct} data
 * @returns {CatalogColour}
 */
export function cardColour(data) {
  const wanted = data.cardColour;
  return (wanted && data.colours.find((c) => c.code === wanted)) || data.colours[0];
}

/**
 * Poza cardului: prima poză a culorii cardului, cu tipul, punctul de focus și textul alternativ.
 * @param {CatalogProduct} data
 * @returns {{ src: string, kind: 'packshot' | 'studio' | 'scena', focus: string | null, alt: string | null, colour: string | undefined }}
 */
export function cardImage(data) {
  const colour = cardColour(data);
  const image = colour.images[0];
  return { src: image.src, kind: image.kind ?? 'packshot', focus: image.focus ?? null, alt: image.alt ?? null, colour: colour.code };
}

/**
 * Packshot-ul culorii principale (colours[0]): prima imagine cu kind „packshot”. Pentru og:image și dalele de categorie.
 * @param {CatalogProduct} data
 * @returns {CatalogImage}
 */
export function packshotImage(data) {
  const images = data.colours[0].images;
  return images.find((i) => (i.kind ?? 'packshot') === 'packshot') ?? images[0];
}
