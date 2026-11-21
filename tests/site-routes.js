// Ce adrese servește site-ul static (src/pages, fără rutele dinamice) și ce reguli are public/_redirects. Folosit de
// testele de redirect și de linkuri.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('../', import.meta.url);
const at = (rel) => fileURLToPath(new URL(rel, ROOT));

/** Există o pagină la adresa asta? (/contact, /contact/, /produse/<slug>/ pentru produsele din catalog). */
export function pageExists(pathname) {
  const clean = pathname.replace(/^\/+|\/+$/g, '');
  if (clean === '') return existsSync(at('src/pages/index.astro'));
  if (existsSync(at(`src/pages/${clean}.astro`)) || existsSync(at(`src/pages/${clean}/index.astro`))) return true;
  const product = /^produse\/([a-z0-9-]+)$/.exec(clean);
  return Boolean(product && existsSync(at(`src/content/products/${product[1]}.json`)));
}

/** Regulile din public/_redirects, ca [sursă, țintă, cod]. */
export const redirectRules = readFileSync(at('public/_redirects'), 'utf8')
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#'))
  .map((l) => l.split(/\s+/));
