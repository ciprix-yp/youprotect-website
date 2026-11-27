// Geometria miniaturii de card (600×750, raport 4:5), pură, fără sharp și fără fișiere: o folosesc card-images.mjs
// și tests/catalog-cards.test.mjs.
//  - packshot și studio: poza încape întreagă („contain”) într-o cutie cu margine de 12 % din lățime pe toate laturile;
//    marginea e în pixeli (alb, sau transparent dacă poza are canal alfa), nu în CSS, ca același fișier să arate la fel
//    oriunde. Fondul alb rămâne compatibil cu mix-blend-multiply din .img-well (alb × fond = fond).
//  - scena: decupaj 4:5 din original, centrat pe `focus` („X% Y%”), apoi redimensionat la 600×750.
export const CARD_WIDTH = 600;
export const CARD_HEIGHT = 750; // 4:5
export const CARD_MARGIN = Math.round(CARD_WIDTH * 0.12); // 72 px
const RATIO = CARD_WIDTH / CARD_HEIGHT;

/** „62% 30%” -> { x: 0.62, y: 0.3 }; undefined -> centru. Orice altceva aruncă. */
export function parseFocus(focus) {
  if (focus === undefined || focus === null) return { x: 0.5, y: 0.5 };
  const m = /^(\d{1,3})% (\d{1,3})%$/.exec(focus);
  if (!m || Number(m[1]) > 100 || Number(m[2]) > 100) throw new Error(`focus invalid: ${JSON.stringify(focus)}`);
  return { x: Number(m[1]) / 100, y: Number(m[2]) / 100 };
}

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

/** Cel mai mare decupaj 4:5 din imaginea width×height, centrat pe focus și ținut în imagine. */
export function cropBox(width, height, focus) {
  const { x, y } = parseFocus(focus);
  let cropW = width;
  let cropH = Math.round(width / RATIO);
  if (cropH > height) {
    cropH = height;
    cropW = Math.round(height * RATIO);
  }
  return {
    left: clamp(Math.round(x * width - cropW / 2), 0, width - cropW),
    top: clamp(Math.round(y * height - cropH / 2), 0, height - cropH),
    width: cropW,
    height: cropH,
  };
}

/**
 * Planul unei miniaturi.
 * @param {{ width: number, height: number, kind?: string, focus?: string | null }} photo dimensiunile originalului
 * @returns {{ mode: 'crop', extract: {left:number,top:number,width:number,height:number} }
 *         | { mode: 'contain', width: number, height: number, left: number, top: number }}
 */
export function planCard({ width, height, kind = 'packshot', focus = null }) {
  if (!(width > 0 && height > 0)) throw new Error('dimensiuni invalide');
  if (kind === 'scena') return { mode: 'crop', extract: cropBox(width, height, focus) };
  const boxW = CARD_WIDTH - 2 * CARD_MARGIN;
  const boxH = CARD_HEIGHT - 2 * CARD_MARGIN;
  const scale = Math.min(boxW / width, boxH / height, 1); // fără mărire: nu umflăm pozele mici
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  return { mode: 'contain', width: w, height: h, left: Math.round((CARD_WIDTH - w) / 2), top: Math.round((CARD_HEIGHT - h) / 2) };
}
