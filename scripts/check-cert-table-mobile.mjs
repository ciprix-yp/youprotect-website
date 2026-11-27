// Măsoară tabelul „Certificările fiecărui model” pe telefon (WebKit 390 px, DPR 3) pe toate paginile de categorie și
// de marcă din dist/: cu <details> deschis, pagina și celulele nu au derulare laterală, iar tabelul încape în viewport.
// Utilizare: `npm run build`, apoi `node scripts/check-cert-table-mobile.mjs`.
// Playwright nu e dependență a repo-ului: scriptul îl caută cu createRequire din PLAYWRIGHT_FROM (un package.json
// dintr-un proiect care îl are; implicit, acest repo). Cod de ieșire 1 dacă vreo pagină depășește 390 px.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist');
const W = 390;
const req = createRequire(process.env.PLAYWRIGHT_FROM ?? join(ROOT, 'package.json'));
const { webkit } = req('playwright-core');

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.json': 'application/json' };
const server = createServer((rq, rs) => {
  let p = normalize(decodeURIComponent(new URL(rq.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  let f = join(DIST, p);
  if (!f.startsWith(DIST)) { rs.writeHead(403).end(); return; }
  if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html');
  if (!existsSync(f)) { rs.writeHead(404).end(); return; }
  rs.writeHead(200, { 'content-type': TYPES[extname(f)] ?? 'application/octet-stream' }).end(readFileSync(f));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const urls = [];
(function walk(d) {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) walk(p);
    else if (n === 'index.html' && readFileSync(p, 'utf8').includes('id="certificari"')) urls.push(p.slice(DIST.length).replace(/index\.html$/, ''));
  }
})(DIST);
urls.sort();

const browser = await webkit.launch();
const ctx = await browser.newContext({ viewport: { width: W, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'ro-RO' });
let bad = 0;
console.log('pagină | scrollWidth | celule cu overflow | tabel (stânga..dreapta) | ok');
for (const u of urls) {
  const page = await ctx.newPage();
  await page.goto(base + u, { waitUntil: 'load' });
  try { const b = page.getByRole('button', { name: 'Doar cele necesare' }); await b.first().waitFor({ timeout: 1500 }); await b.first().click(); } catch {}
  const m = await page.evaluate(() => {
    const d = document.querySelector('#certificari').parentElement.querySelector('details');
    d.open = true;
    const t = d.querySelector('table');
    const r = t.getBoundingClientRect();
    const cells = [...t.querySelectorAll('th, td')].filter((c) => c.scrollWidth > c.clientWidth).length;
    return { sw: document.documentElement.scrollWidth, cells, left: Math.round(r.left), right: Math.round(r.right), rows: t.tBodies[0].rows.length };
  });
  const ok = m.sw <= W && m.cells === 0 && m.left >= 0 && m.right <= W;
  if (!ok) bad += 1;
  console.log(`${u} | ${m.sw} | ${m.cells} | ${m.left}..${m.right} | ${ok ? 'ok' : 'DEPĂȘIT'}`);
  await page.close();
}
await browser.close();
server.close();
console.log(`${urls.length} pagini, ${bad} cu depășire`);
process.exit(bad ? 1 : 0);
