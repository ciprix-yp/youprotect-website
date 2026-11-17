// /api/crm/leads — de aici Prospector CRM (pe M1, în tailnet) preia cererile de pe site.
// CRM-ul face cererea spre site (pull), deci serverul lui nu trebuie expus în internet.
//
//   GET  /api/crm/leads?limit=50[&include_preview=1]  -> cererile încă nepreluate, cele mai vechi primele
//   POST /api/crm/leads  { "acks": [{ "id": "...", "crmRef": "..." }] } -> le marchează preluate
//
// Autentificare: Authorization: Bearer <CRM_SYNC_TOKEN> (secret în Cloudflare Pages și în Keychain).
// Cererile preluate se șterg din D1 după 30 de zile: rămân în CRM, unde se aplică termenul de păstrare.
import { jsonResponse, safeEqual } from '../../../server/leads.js';

const MAX_LIMIT = 100;
const MAX_ACKS = 100;

function authorized(request, env) {
  const token = env.CRM_SYNC_TOKEN;
  if (typeof token !== 'string' || token.length < 32) return false;
  const header = request.headers.get('Authorization') || '';
  const given = header.startsWith('Bearer ') ? header.slice(7) : '';
  return safeEqual(given, token);
}

function unavailable(env) {
  return !env.LEADS_DB ? jsonResponse({ error: 'Inbox-ul nu e configurat.' }, 503) : null;
}

export const onRequestGet = async ({ request, env }) => {
  if (!authorized(request, env)) return jsonResponse({ error: 'Neautorizat.' }, 401);
  const missing = unavailable(env);
  if (missing) return missing;

  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number.parseInt(url.searchParams.get('limit') || '50', 10) || 50, 1), MAX_LIMIT);
  const includePreview = url.searchParams.get('include_preview') === '1' ? 1 : 0;
  const { results } = await env.LEADS_DB.prepare(
    `SELECT id, created_at, environment, tag, intent, name, company, cui, phone, email, product, answers,
            source_url, email_sent_at
       FROM lead
      WHERE synced_at IS NULL AND (environment = 'production' OR ?1 = 1)
      ORDER BY created_at
      LIMIT ?2`,
  )
    .bind(includePreview, limit)
    .all();

  const leads = results.map((row) => {
    let answers = [];
    try {
      answers = JSON.parse(row.answers);
    } catch (_e) {
      // Rând vechi sau corupt: îl trimitem fără răspunsuri.
    }
    return { ...row, answers };
  });
  return jsonResponse({ leads });
};

export const onRequestPost = async ({ request, env }) => {
  if (!authorized(request, env)) return jsonResponse({ error: 'Neautorizat.' }, 401);
  const missing = unavailable(env);
  if (missing) return missing;

  let body;
  try {
    body = await request.json();
  } catch (_e) {
    return jsonResponse({ error: 'Date invalide.' }, 400);
  }
  const acks = Array.isArray(body?.acks) ? body.acks.slice(0, MAX_ACKS) : [];
  const valid = acks.filter(
    (a) => typeof a?.id === 'string' && /^[0-9a-f-]{36}$/i.test(a.id) && (a.crmRef == null || typeof a.crmRef === 'string'),
  );
  const now = new Date().toISOString();
  const statements = valid.map((a) =>
    env.LEADS_DB.prepare('UPDATE lead SET synced_at = ?2, crm_ref = ?3 WHERE id = ?1 AND synced_at IS NULL').bind(
      a.id,
      now,
      a.crmRef ? a.crmRef.slice(0, 100) : null,
    ),
  );
  statements.push(
    env.LEADS_DB.prepare("DELETE FROM lead WHERE synced_at IS NOT NULL AND synced_at < datetime('now', '-30 days')"),
  );
  await env.LEADS_DB.batch(statements);
  return jsonResponse({ acknowledged: valid.length });
};
