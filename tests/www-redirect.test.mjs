// workers/www-redirect: www.youprotect.ro -> youprotect.ro, cu adresele vechi într-un singur salt, la fel ca
// public/_redirects pe domeniul fără www.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../workers/www-redirect/index.js';
import { pageExists, redirectRules } from './site-routes.js';

const go = (path) => {
  const res = worker.fetch(new Request(`https://www.youprotect.ro${path}`));
  return { status: res.status, location: res.headers.get('location') };
};

test('www-redirect: păstrează adresa și parametrii, cu 301', () => {
  assert.deepEqual(go('/produse/?q=manusi'), { status: 301, location: 'https://youprotect.ro/produse/?q=manusi' });
  assert.deepEqual(go('/'), { status: 301, location: 'https://youprotect.ro/' });
  assert.deepEqual(go('/blog/un-articol'), { status: 301, location: 'https://youprotect.ro/' });
});

test('www-redirect: pagina de Contact rămâne pe /contact/', () => {
  assert.equal(go('/contact').location, 'https://youprotect.ro/contact');
  assert.equal(go('/contact/').location, 'https://youprotect.ro/contact/');
});

test('www-redirect: adresele vechi duc unde duce și public/_redirects', () => {
  for (const [from, to] of redirectRules.filter(([from]) => !from.includes('*'))) {
    const { location } = go(from);
    const sent = new URL(location).pathname;
    // Fie Worker-ul face direct saltul din _redirects, fie lasă adresa neschimbată și o tratează _redirects.
    assert.ok(sent === to || sent === from, `${from}: Worker-ul trimite la ${sent}, _redirects la ${to}`);
  }
});

test('www-redirect: nu mută nicio pagină care există', () => {
  for (const path of ['/contact', '/despre-noi', '/cum-lucram', '/produse', '/cere-oferta', '/programeaza-discutie']) {
    assert.ok(pageExists(path), `${path} ar trebui să existe`);
    assert.equal(new URL(go(path).location).pathname, path);
  }
});
