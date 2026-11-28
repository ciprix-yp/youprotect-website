// Cardurile din catalog folosesc o variantă de 600 px a pozei de produs (scripts/catalog/card-images.mjs).
const LOCAL_PRODUCT_IMAGE = /^\/images\/products\/[a-z0-9-]+\/[A-Za-z0-9_-]+\.webp$/;

/** „/images/products/x/09-PS.webp” -> „/images/products/x/09-PS-card.webp”; orice altă cale rămâne neschimbată. */
export function cardSrc(src) {
  if (typeof src !== 'string' || !LOCAL_PRODUCT_IMAGE.test(src) || src.endsWith('-card.webp')) return src;
  return src.replace(/\.webp$/, '-card.webp');
}

/**
 * „/images/products/x/09-PS.webp” -> „/images/products/x/09-PS-print.jpg”: varianta JPEG de 600 px, pe fond alb, pe care
 * /catalog/ o pune în locul pozei înainte de „Salvează ca PDF”. Chrome păstrează JPEG-ul așa cum e în PDF, dar WebP-ul
 * îl reîncodează fără pierderi: cu WebP, PDF-ul ieșea de 13 MB (44 MB pe Retina), prea mare pentru un email.
 * Orice altă cale rămâne neschimbată.
 */
export function printSrc(src) {
  if (typeof src !== 'string' || !LOCAL_PRODUCT_IMAGE.test(src) || src.endsWith('-card.webp')) return src;
  return src.replace(/\.webp$/, '-print.jpg');
}
