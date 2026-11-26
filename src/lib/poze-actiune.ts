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
