// Search Console pentru youprotect.ro, prin contul de serviciu (fără dependențe).
// Rulare: secret run youprotect-website -- node scripts/seo/gsc.mjs <comandă> [argumente]
//   sites                                  proprietățile la care are acces contul
//   sitemaps <site>                        sitemap-urile trimise și starea lor
//   submit <site> <sitemap-url>            trimite un sitemap
//   queries <site> <start> <end> [dim]     căutări (dim: query | page | query,page), max 25.000 de rânduri, JSON
//   inspect <site> <url>...                starea de indexare a fiecărui URL, JSON
// <site> e exact cum îl dă „sites”, de exemplu sc-domain:youprotect.ro sau https://youprotect.ro/
// Datele din Search Console nu se pun în repo (repo-ul e public): scrie-le în afara lui.
import { createSign } from 'node:crypto';

const SCOPE = 'https://www.googleapis.com/auth/webmasters';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API = 'https://www.googleapis.com/webmasters/v3';
const INSPECT_URL = 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect';

function serviceAccount() {
  const raw = process.env.GSC_SERVICE_ACCOUNT_B64;
  if (!raw) throw new Error('GSC_SERVICE_ACCOUNT_B64 lipsește (secret run youprotect-website -- …)');
  let sa;
  try { sa = JSON.parse(Buffer.from(raw.trim(), 'base64').toString('utf8')); } catch { throw new Error('GSC_SERVICE_ACCOUNT_B64 nu e un JSON în base64'); }
  if (sa.type !== 'service_account' || !sa.client_email || !sa.private_key) throw new Error('cheia nu e de cont de serviciu');
  return sa;
}

const b64url = (v) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');

async function accessToken() {
  const sa = serviceAccount();
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64url({ alg: 'RS256', typ: 'JWT' })}.${b64url({ iss: sa.client_email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 })}`;
  const signature = createSign('RSA-SHA256').update(unsigned).sign(sa.private_key, 'base64url');
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) throw new Error(`Google a refuzat autentificarea: HTTP ${res.status} ${body.error ?? ''}`);
  return body.access_token;
}

async function call(token, method, url, payload) {
  const res = await fetch(url, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(payload ? { 'content-type': 'application/json' } : {}) },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    let reason = '';
    try { const e = JSON.parse(text).error; reason = `${e.status ?? ''} ${e.message ?? ''}`.slice(0, 300); } catch { /* fără detalii */ }
    throw new Error(`HTTP ${res.status} ${reason}`.trim());
  }
  return text ? JSON.parse(text) : {};
}

const site = (s) => {
  if (!/^(sc-domain:youprotect\.ro|https:\/\/(www\.)?youprotect\.ro\/)$/.test(s ?? '')) throw new Error(`proprietate invalidă: ${s}`);
  return encodeURIComponent(s);
};
const date = (d) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d ?? '')) throw new Error(`dată invalidă: ${d} (AAAA-LL-ZZ)`);
  return d;
};

const [cmd, ...args] = process.argv.slice(2);
try {
  // Argumentele se verifică înainte de orice cerere către Google.
  if (cmd !== 'sites') site(args[0]);
  if (cmd === 'queries') { date(args[1]); date(args[2]); }
  const token = await accessToken();
  let out;
  if (cmd === 'sites') out = await call(token, 'GET', `${API}/sites`);
  else if (cmd === 'sitemaps') out = await call(token, 'GET', `${API}/sites/${site(args[0])}/sitemaps`);
  else if (cmd === 'submit') {
    if (!/^https:\/\/youprotect\.ro\/[a-z0-9./-]+\.xml$/.test(args[1] ?? '')) throw new Error(`sitemap invalid: ${args[1]}`);
    await call(token, 'PUT', `${API}/sites/${site(args[0])}/sitemaps/${encodeURIComponent(args[1])}`);
    out = { trimis: args[1] };
  } else if (cmd === 'queries') {
    const dimensions = (args[3] ?? 'query').split(',').filter((d) => ['query', 'page', 'country', 'device'].includes(d));
    const rows = [];
    for (let startRow = 0; startRow < 25000; startRow += 5000) {
      const page = await call(token, 'POST', `${API}/sites/${site(args[0])}/searchAnalytics/query`, {
        startDate: date(args[1]), endDate: date(args[2]), dimensions, rowLimit: 5000, startRow, dataState: 'final',
      });
      rows.push(...(page.rows ?? []));
      if ((page.rows ?? []).length < 5000) break;
    }
    out = { dimensions, rows };
  } else if (cmd === 'inspect') {
    out = [];
    for (const url of args.slice(1)) {
      if (!/^https:\/\/youprotect\.ro\/[^\s]*$/.test(url)) throw new Error(`URL invalid: ${url}`);
      const r = await call(token, 'POST', INSPECT_URL, { inspectionUrl: url, siteUrl: decodeURIComponent(site(args[0])), languageCode: 'ro' });
      out.push({ url, ...r.inspectionResult });
    }
  } else {
    throw new Error('comandă necunoscută (sites | sitemaps | submit | queries | inspect)');
  }
  console.log(JSON.stringify(out, null, 2));
} catch (error) {
  console.error(`gsc: ${String(error?.message ?? error)}`);
  process.exit(1);
}
