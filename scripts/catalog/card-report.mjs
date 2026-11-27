// Raport CSV (stdout) cu ce afișează cardul fiecărui produs: poza pe model (studio/scenă) sau packshot, și de ce.
// Citește src/content/products/*.json; motivul pentru packshot vine din catalog/maps/card-photo-reasons.json.
// Rulează: node scripts/catalog/card-report.mjs > raport.csv
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cardColour, cardImage } from '../../src/lib/catalog-images.js';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
export const HEADER = ['slug', 'furnizor', 'cod', 'culoare card', 'card', 'sourceId sau view', 'motiv'];

const csv = (value) => (/[",\n]/.test(String(value)) ? `"${String(value).replaceAll('"', '""')}"` : String(value));

/** Rândurile raportului pentru toate produsele (sortate după slug). */
export function reportRows(root = ROOT) {
  const reasons = JSON.parse(readFileSync(join(root, 'catalog/maps/card-photo-reasons.json'), 'utf8'));
  return readdirSync(join(root, 'src/content/products'))
    .filter((n) => n.endsWith('.json'))
    .sort()
    .map((n) => {
      const slug = n.slice(0, -'.json'.length);
      const data = JSON.parse(readFileSync(join(root, 'src/content/products', n), 'utf8'));
      const colour = cardColour(data);
      const photo = cardImage(data);
      const image = colour.images[0];
      const shows = photo.kind === 'packshot' ? 'packshot' : photo.kind === 'studio' ? 'model-studio' : 'model-scenă';
      const sourceId = /-C([0-9a-f]{8})\.webp$/.exec(photo.src)?.[1] ?? image.view ?? '';
      return {
        slug,
        furnizor: data.supplier.brand,
        cod: data.supplier.model ?? '',
        culoare: colour.code ? `${colour.code} ${colour.name ?? ''}`.trim() : '(fără culoare)',
        card: shows,
        sourceId,
        motiv: shows === 'packshot' ? (reasons[slug] ?? '') : '',
      };
    });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const lines = [HEADER, ...reportRows().map((r) => [r.slug, r.furnizor, r.cod, r.culoare, r.card, r.sourceId, r.motiv])];
  process.stdout.write(`${lines.map((row) => row.map(csv).join(',')).join('\n')}\n`);
}
