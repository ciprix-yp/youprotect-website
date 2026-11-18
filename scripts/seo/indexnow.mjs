// Anunță Bing (și ceilalți participanți IndexNow) când se schimbă pagini pe youprotect.ro.
// Cheia IndexNow e publică prin design: fișierul public/<cheie>.txt dovedește că site-ul e al nostru.
// Rulare, după un deploy: node scripts/seo/indexnow.mjs            (toate URL-urile din sitemap)
//                         node scripts/seo/indexnow.mjs <url>...   (doar acestea)
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HOST = 'youprotect.ro';
const PUBLIC = fileURLToPath(new URL('../../public/', import.meta.url));
const keyFile = readdirSync(PUBLIC).find((f) => /^[a-f0-9]{32}\.txt$/.test(f));
if (!keyFile) throw new Error('lipsește public/<cheie>.txt');
const key = readFileSync(PUBLIC + keyFile, 'utf8').trim();

let urls = process.argv.slice(2);
if (!urls.length) {
  const xml = await (await fetch(`https://${HOST}/sitemap-0.xml`)).text();
  urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
}
const outside = urls.filter((u) => !u.startsWith(`https://${HOST}/`));
if (outside.length) throw new Error(`URL-uri din afara site-ului: ${outside.join(', ')}`);

const res = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host: HOST, key, keyLocation: `https://${HOST}/${keyFile}`, urlList: urls }),
});
console.log(`IndexNow: HTTP ${res.status} pentru ${urls.length} URL-uri`);
if (!res.ok) process.exit(1);
