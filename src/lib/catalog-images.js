// Cardurile din catalog folosesc o variantă de 600 px a pozei de produs (scripts/catalog/card-images.mjs).
const LOCAL_PRODUCT_IMAGE = /^\/images\/products\/[a-z0-9-]+\/[A-Za-z0-9_-]+\.webp$/;

/** „/images/products/x/09-PS.webp” -> „/images/products/x/09-PS-card.webp”; orice altă cale rămâne neschimbată. */
export function cardSrc(src) {
  if (typeof src !== 'string' || !LOCAL_PRODUCT_IMAGE.test(src) || src.endsWith('-card.webp')) return src;
  return src.replace(/\.webp$/, '-card.webp');
}
