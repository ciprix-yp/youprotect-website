// Geometria miniaturii de card (600×750, raport 4:5), pură, fără sharp și fără fișiere: o folosesc card-images.mjs
// și tests/catalog-cards.test.mjs.
//  - packshot și studio: poza încape întreagă („contain”) într-o cutie cu margine de 12 % din lățime pe toate laturile;
//    marginea e în pixeli (alb, sau transparent dacă poza are canal alfa), nu în CSS, ca același fișier să arate la fel
//    oriunde. Fondul alb rămâne compatibil cu mix-blend-multiply din .img-well (alb × fond = fond).
//    La STUDIO (om pe fond alb, ex. Sir Safety 1100×1100, siluetă ~300 px lată) se taie mai întâi marginile aproape-albe
//    (contentBox, cu toleranță), ca silueta să umple cutia, nu pătratul alb din jur; fără mărire peste rezoluția sursei.
//    Packshot-urile nu se taie (cardurile lor rămân ca înainte).
//  - scena: decupaj 4:5 din original, poziționat după `focus` („X% Y%”) cu semantica CSS `object-position`, apoi
//    redimensionat la 600×750.
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

/**
 * Cel mai mare decupaj 4:5 din imaginea width×height, cu semantica CSS `object-position`: X% aliniază punctul X% al
 * pozei cu punctul X% al decupajului (nu îl centrează). Așa decupajul cardului coincide cu zona vizibilă din galerie
 * (`object-fit: cover; object-position: <focus>`) și tranziția card -> fișă nu sare.
 */
export function cropBox(width, height, focus) {
  const { x, y } = parseFocus(focus);
  let cropW = width;
  let cropH = Math.round(width / RATIO);
  if (cropH > height) {
    cropH = height;
    cropW = Math.round(height * RATIO);
  }
  return {
    left: clamp(Math.round(x * (width - cropW)), 0, width - cropW),
    top: clamp(Math.round(y * (height - cropH)), 0, height - cropH),
    width: cropW,
    height: cropH,
  };
}

export const TRIM_TOLERANCE = 12; // distanța maximă față de alb (0–255, per canal) la care un pixel încă e „fundal”
const TRIM_MIN_RUN = 3; // o linie/coloană cu mai puțin de atâția pixeli de conținut e zgomot (praf), nu silueta

/**
 * Caseta conținutului unei poze pe fond alb sau transparent: marginile aproape-albe (sau cu alfa mic) se taie.
 * @param {Uint8Array} pixels octeți raw, `channels` pe pixel (1, 2, 3 sau 4; la 2 și 4 ultimul canal e alfa)
 * @returns {{ left: number, top: number, width: number, height: number }} toată imaginea dacă nu găsește conținut
 */
export function contentBox(pixels, width, height, channels, tolerance = TRIM_TOLERANCE) {
  if (!(width > 0 && height > 0) || pixels.length < width * height * channels) throw new Error('pixeli invalizi');
  const hasAlpha = channels === 2 || channels === 4;
  const colour = hasAlpha ? channels - 1 : channels;
  const rows = new Uint32Array(height);
  const cols = new Uint32Array(width);
  const isContent = (i) => {
    if (hasAlpha && pixels[i + colour] <= tolerance) return false; // transparent: fundal
    for (let c = 0; c < colour; c++) if (pixels[i + c] < 255 - tolerance) return true;
    return false; // alb (în toleranță): fundal
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (isContent((y * width + x) * channels)) {
        rows[y]++;
        cols[x]++;
      }
    }
  }
  const first = (counts) => counts.findIndex((n) => n >= TRIM_MIN_RUN);
  const last = (counts) => {
    for (let i = counts.length - 1; i >= 0; i--) if (counts[i] >= TRIM_MIN_RUN) return i;
    return -1;
  };
  const left = first(cols);
  const top = first(rows);
  if (left < 0 || top < 0) return { left: 0, top: 0, width, height };
  const right = last(cols);
  const bottom = last(rows);
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

/**
 * Planul unei miniaturi.
 * @param {{ width: number, height: number, kind?: string, focus?: string | null, content?: {left:number,top:number,width:number,height:number} }} photo
 *   dimensiunile originalului; `content` = contentBox(), folosit doar la kind „studio”
 * @returns {{ mode: 'crop', extract: {left:number,top:number,width:number,height:number} }
 *         | { mode: 'contain', width: number, height: number, left: number, top: number, extract?: {left:number,top:number,width:number,height:number} }}
 */
export function planCard({ width, height, kind = 'packshot', focus = null, content = undefined }) {
  if (!(width > 0 && height > 0)) throw new Error('dimensiuni invalide');
  if (kind === 'scena') return { mode: 'crop', extract: cropBox(width, height, focus) };
  const boxW = CARD_WIDTH - 2 * CARD_MARGIN;
  const boxH = CARD_HEIGHT - 2 * CARD_MARGIN;
  const trim = kind === 'studio' && content ? content : null;
  const srcW = trim ? trim.width : width;
  const srcH = trim ? trim.height : height;
  const scale = Math.min(boxW / srcW, boxH / srcH, 1); // fără mărire: nu umflăm pozele mici
  const w = Math.max(1, Math.round(srcW * scale));
  const h = Math.max(1, Math.round(srcH * scale));
  const plan = { mode: 'contain', width: w, height: h, left: Math.round((CARD_WIDTH - w) / 2), top: Math.round((CARD_HEIGHT - h) / 2) };
  return trim ? { ...plan, extract: { ...trim } } : plan;
}
