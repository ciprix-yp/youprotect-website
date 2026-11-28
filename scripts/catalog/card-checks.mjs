// Verificări pure pentru „catalog cu omul îmbrăcat”: primesc date (un produs din src/content/products/*.json, o poză,
// un card parsat din dist/) și întorc lista de probleme (goală = în regulă). Le folosesc tests/catalog-pe-model.test.mjs
// (pe toate cele 75 de produse, plus cazuri greșite construite, ca verificarea să nu treacă „gol”) și
// scripts/catalog/card-report.mjs. Regulile: PROJECT_OS/08-GHID_CONTINUT.md, „Poza pe card și în galerie”.
import { cardImage } from '../../src/lib/catalog-images.js';

/** Produsele excluse de owner (25.11.2026) din poza pe model; se potrivesc pe codul din slug. */
export const OWNER_EXCLUDED = { 19035: 'practică nesigură: fără cască lângă schelă', 20382: 'mărci concurente în cadru' };
/** Categoriile de încălțăminte: rămân pe packshot (la niciun furnizor nu există poze pe model utilizabile). */
export const FOOTWEAR = new Set(['incaltaminte', 'incaltaminte-business']);

export const kindOf = (image) => image.kind ?? 'packshot';
const isPerson = (image) => kindOf(image) !== 'packshot';
export const allImages = (data) => data.colours.flatMap((c) => c.images);
/** true dacă produsul are poză pe model oriunde în colours[] sau cardColour setat. */
export const hasPersonPhoto = (data) => Boolean(data.cardColour) || allImages(data).some(isPerson);
/** Cardul arată omul îmbrăcat (cardImage nu e packshot). */
export const cardShowsPerson = (data) => kindOf(cardImage(data)) !== 'packshot';

/** Codul articolului din slug („…-mascot-accelerate-safe-19035” -> „19035”), sau null. */
export const articleCode = (slug) => /-(\d{5})$/.exec(slug)?.[1] ?? null;

/** a: cardColour există în colours[], iar prima poză a culorii e pe model (studio/scena). */
export function checkCardColour(data) {
  const errors = [];
  if (!data.cardColour) return errors;
  const colour = data.colours.find((c) => c.code === data.cardColour);
  if (!colour) return [`cardColour „${data.cardColour}” nu e printre culorile produsului (${data.colours.map((c) => c.code).join(', ')})`];
  const first = colour.images[0];
  if (!first || !isPerson(first)) errors.push(`prima poză a culorii „${data.cardColour}” nu e pe model (kind: ${first ? kindOf(first) : 'lipsă'})`);
  return errors;
}

/** b + c: produsele excluse și încălțămintea nu au nicio poză pe model. */
export function checkNoPersonPhoto(slug, data) {
  const errors = [];
  const code = articleCode(slug);
  const why = (code && OWNER_EXCLUDED[code]) || (FOOTWEAR.has(data.category) && 'încălțămintea rămâne pe packshot') || null;
  if (!why) return errors;
  if (data.cardColour) errors.push(`${slug}: cardColour „${data.cardColour}” la un produs fără poză pe model (${why})`);
  for (const image of allImages(data)) if (isPerson(image)) errors.push(`${slug}: imagine ${kindOf(image)} (${image.src}) la un produs fără poză pe model (${why})`);
  return errors;
}

// Alt-ul pozei pe model: descrie produsul purtat, în română, fără sugestii de client/angajat/testimonial.
const EN_WORDS = /\b(wearing|wears|worker|workers|photo|jacket|person|man|woman|safety vest)\b/i;
const RO_HINT = /[ăâîșțĂÂÎȘȚ]|\b(purtat|purtată|purtați|purtate|purtând|cu|de|pe|în|din|și|om|casca|cască)\b/i;
const BANNED = /you\s*protect|angajat|client|testimonial/i;
const CEDILLA = /[şţŞŢ]/;

/** e: reguli pentru alt-ul unei imagini kind ≠ packshot. */
export function checkAlt(alt) {
  const errors = [];
  if (typeof alt !== 'string' || alt.trim() === '') return ['alt lipsește'];
  if (alt.length < 20 || alt.length > 140) errors.push(`alt de ${alt.length} caractere (20–140)`);
  if (/^\p{Ll}/u.test(alt)) errors.push('alt începe cu literă mică');
  if (BANNED.test(alt)) errors.push(`alt conține un cuvânt interzis: „${BANNED.exec(alt)[0]}”`);
  if (EN_WORDS.test(alt)) errors.push(`alt cu cuvânt englezesc: „${EN_WORDS.exec(alt)[0]}”`);
  if (CEDILLA.test(alt)) errors.push('alt cu ș/ț cu sedilă (se scrie cu virgulă)');
  if (!RO_HINT.test(alt)) errors.push('alt fără semne de română');
  return errors;
}

/** e: toate pozele kind ≠ packshot ale produsului au alt valid. */
export function checkAlts(data) {
  return allImages(data).filter(isPerson).flatMap((image) => checkAlt(image.alt).map((e) => `${image.src}: ${e}`));
}
