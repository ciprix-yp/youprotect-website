// Pozele reale cu oameni în acțiune (MASCOT, Portwest, Sir Safety). Pagina citește o poză DOAR prin id: alt-ul,
// creditul și variantele stau în src/data/poze-actiune*.json, nu se copiază în pagini.
// Creditul nu apare vizibil pe site (nici figcaption, nici „Foto:”): stă doar în datele structurate (ImageObject).
// Regulile de utilizare (max. 2 pagini, erou unic, Portwest doar lângă produse Portwest) sunt impuse de
// tests/poze-actiune.test.mjs; tiparul pe care îl detectează testul e descris în src/components/media/ActionPhoto.astro.
import photos from '../data/poze-actiune.json' with { type: 'json' };
import variants from '../data/poze-actiune-variante.json' with { type: 'json' };
import { SITE } from './site.ts';

export interface PhotoVariant {
  width: number;
  height: number;
  file: string;
  bytes: number;
  /** Decupaj portret 4:5 pentru telefon (doar eroul homepage-ului); nu intră în srcset-ul obișnuit. */
  portret?: boolean;
}

export interface ActionPhotoData {
  id: string;
  furnizor: 'mascot' | 'portwest' | 'sir-safety';
  slug: string;
  alt: string;
  creditText: string;
  copyrightNotice: string;
  creator: { '@type': 'Organization'; name: string };
  sursa: string;
  latimi: number[];
  /** Poza are voie să fie erou (prima imagine mare a unei pagini). */
  erou: boolean;
  /** Decupaj portret 4:5 (fracții [x0, y0, x1, y1] din sursă) pentru telefon; variantele `-p768`/`-p960` le face scriptul. */
  portret?: { decupaj: [number, number, number, number] };
  obiectPoz: { desktop: string; telefon: string };
}

export const ACTION_PHOTOS = photos as ActionPhotoData[];
const VARIANTS = variants as Record<string, PhotoVariant[]>;

export const ACTION_PHOTO_DIR = '/images/actiune/';

const byId = new Map(ACTION_PHOTOS.map((p) => [p.id, p]));

/** Poza după id. Id necunoscut: eroare, ca build-ul să pice în loc să randeze gol. */
export function getPhoto(id: string): ActionPhotoData {
  const photo = byId.get(id);
  if (!photo) throw new Error(`Poza de acțiune „${id}” nu există în src/data/poze-actiune.json.`);
  return photo;
}

/** Variantele unei poze (fără decupajul portret), de la cea mai mică la cea mai mare. */
export function photoVariants(id: string): PhotoVariant[] {
  getPhoto(id);
  const list = VARIANTS[id]?.filter((v) => !v.portret);
  if (!list || list.length === 0) throw new Error(`Poza „${id}” nu are variante în poze-actiune-variante.json.`);
  return [...list].sort((a, b) => a.width - b.width);
}

/** Variantele decupajului portret 4:5, de la cea mai mică la cea mai mare; eroare dacă poza nu are decupaj portret. */
export function portraitVariants(id: string): PhotoVariant[] {
  getPhoto(id);
  const list = VARIANTS[id]?.filter((v) => v.portret);
  if (!list || list.length === 0) throw new Error(`Poza „${id}” nu are decupaj portret în poze-actiune-variante.json.`);
  return [...list].sort((a, b) => a.width - b.width);
}

/** Cea mai mare variantă. */
export function largestVariant(id: string): PhotoVariant {
  const list = photoVariants(id);
  return list[list.length - 1];
}

const urlOf = (v: PhotoVariant) => `${ACTION_PHOTO_DIR}${v.file}`;

/** Valoarea pentru `srcset`, din variantele reale: „/images/actiune/x-640.webp 640w, …”. */
export function photoSrcset(id: string): string {
  return photoVariants(id)
    .map((v) => `${urlOf(v)} ${v.width}w`)
    .join(', ');
}

/** `srcset` pentru decupajul portret: „/images/actiune/x-p768.webp 768w, …”. */
export function portraitSrcset(id: string): string {
  return portraitVariants(id)
    .map((v) => `${urlOf(v)} ${v.width}w`)
    .join(', ');
}

/** Calea unei variante: cea mai mică variantă cu lățimea >= `width`, altfel cea mai mare (implicit: cea mai mare). */
export function photoSrc(id: string, width?: number): string {
  const list = photoVariants(id);
  if (width === undefined) return urlOf(list[list.length - 1]);
  return urlOf(list.find((v) => v.width >= width) ?? list[list.length - 1]);
}

/** Dimensiunile (pentru `width`/`height` din HTML) ale celei mai mari variante. */
export function photoSize(id: string): { width: number; height: number } {
  const { width, height } = largestVariant(id);
  return { width, height };
}

/** `@id` stabil al ImageObject-ului unei poze (același pe orice pagină care o folosește). */
export function imageId(id: string): string {
  getPhoto(id);
  return `${SITE.url}/#imagine-actiune-${id.toLowerCase()}`;
}

/** ImageObject schema.org pentru o poză. Fără `license`/`acquireLicensePage`: nu avem de dat licență mai departe. */
export function imageObject(id: string) {
  const photo = getPhoto(id);
  const big = largestVariant(id);
  const contentUrl = `${SITE.url}${urlOf(big)}`;
  return {
    '@type': 'ImageObject',
    '@id': imageId(id),
    contentUrl,
    url: contentUrl,
    width: big.width,
    height: big.height,
    description: photo.alt,
    inLanguage: 'ro',
    creditText: photo.creditText,
    copyrightNotice: photo.copyrightNotice,
    creator: { ...photo.creator },
  };
}

export function imageObjects(ids: string[]) {
  return ids.map(imageObject);
}

/**
 * Nodurile pozelor unei pagini, ca `@graph` de sine stătător. Pentru paginile fără JSON-LD:
 *   <script type="application/ld+json" set:html={jsonLd(imageGraph(['M02', 'M04']))} />
 * Pentru paginile care au deja WebPage/Article, nodul paginii referă pozele după `@id`:
 *   const webPage = { '@type': 'WebPage', '@id': `${url}#webpage`, primaryImageOfPage: imageRef('M02'),
 *                     image: imageRefs(['M02', 'M04']) };
 *   <script type="application/ld+json" set:html={jsonLd({ '@context': 'https://schema.org',
 *     '@graph': [webPage, ...imageObjects(['M02', 'M04'])] })} />
 */
export function imageGraph(ids: string[]) {
  return { '@context': 'https://schema.org', '@graph': imageObjects(ids) };
}

/** Referință `{ '@id': … }` către ImageObject-ul unei poze (pentru `image` / `primaryImageOfPage`). */
export function imageRef(id: string) {
  return { '@id': imageId(id) };
}

export function imageRefs(ids: string[]) {
  return ids.map(imageRef);
}

/**
 * Lățimea implicită a unei poze din corp pe telefon: toată coloana (`calc(100vw - 2rem)`, gutter de 16 px). Pe un
 * ecran 3x asta cere 1074 px la 390 px lățime și browserul alege varianta de 1440 px (2,5-3x mai mult decât are nevoie
 * poza la ~2,7x).
 */
export const PHONE_FULL_WIDTH = 'calc(100vw - 2rem)';

/** Pe telefon cu densitate >= 2,5 dppx poza din corp se cere la 75% din coloană: 390 px -> 806 px, 430 px -> 895 px, adică varianta de 960 px (2,7x pe 3x). */
export const BODY_PHONE_HIDPI = '(max-width: 767px) and (min-resolution: 2.5dppx) calc((100vw - 2rem) * 0.75)';

/** Desparte o listă `sizes` la virgulele din afara parantezelor. */
function sizesEntries(sizes: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < sizes.length; i++) {
    const ch = sizes[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ',' && depth === 0) {
      out.push(sizes.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(sizes.slice(start).trim());
  return out.filter(Boolean);
}

/**
 * `sizes` pentru pozele din corp (nu eroii). Regula: dacă ULTIMA intrare a listei (cea fără condiție de media, valabilă pe
 * telefon) e exact `PHONE_FULL_WIDTH`, se pune `BODY_PHONE_HIDPI` imediat înaintea ei: telefoanele cu 2,5 dppx sau mai mult primesc varianta
 * de 960 px în loc de 1440 px; DPR 1-2 și toate lățimile de la 768 px în sus rămân neschimbate. Alte valori (de ex. `70vw`,
 * `100vw`) trec nemodificate. ActionPhoto o aplică singur, deci paginile păstrează `sizes` cum e și beneficiază fără modificări.
 */
export function bodySizes(sizes: string): string {
  const entries = sizesEntries(sizes);
  if (entries.length === 0 || entries[entries.length - 1] !== PHONE_FULL_WIDTH) return sizes;
  // Imediat înaintea ultimei intrări: intrările condiționate ale paginii (ex. `(min-width: 640px) 48vw`) câștigă la 640-767 px.
  return [...entries.slice(0, -1), BODY_PHONE_HIDPI, PHONE_FULL_WIDTH].join(', ');
}
