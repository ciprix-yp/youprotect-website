// Worker-ul www-redirect (Cloudflare, ruta www.youprotect.ro/*): trimite orice adresă cu www pe youprotect.ro, cu 301.
// Adresele vechi de pe site-ul Wix merg direct pe pagina nouă, într-un singur salt. Pe domeniul fără www, aceleași
// adrese le tratează public/_redirects; tests/www-redirect.test.mjs verifică că cele două spun același lucru.
// Până pe 21.11.2026 codul a stat doar în Cloudflare (OPS-004). Publicare: vezi wrangler.toml de lângă.

/** Adresa veche -> pagina nouă. Țintele au „/” la final: fără el, Cloudflare Pages mai face un 308. */
const MAP = {
  '/cine-suntem': '/despre-noi/',
  '/despre': '/despre-noi/',
  '/servicii': '/cum-lucram/',
  '/magazin': '/produse/',
  '/shop': '/produse/',
  '/produsele-noastre': '/produse/',
};

export default {
  /** @param {Request} request */
  fetch(request) {
    const url = new URL(request.url);
    url.hostname = 'youprotect.ro';
    const path = url.pathname;
    if (Object.hasOwn(MAP, path)) url.pathname = MAP[path];
    else if (path === '/blog' || path.startsWith('/blog/')) url.pathname = '/';
    return Response.redirect(url.toString(), 301);
  },
};
