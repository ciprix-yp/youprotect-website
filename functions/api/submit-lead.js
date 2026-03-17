import { Client } from 'pg';

function normalizeString(value, maxLength = null) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (maxLength && trimmed.length > maxLength) return trimmed.slice(0, maxLength);
  return trimmed;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function resolveSourcePageId(sourceUrl) {
  if (!sourceUrl) return 1;
  try {
    const pathname = new URL(sourceUrl, 'https://youprotect.ro').pathname;
    if (pathname.startsWith('/produse')) return 6;
    if (pathname.startsWith('/despre-noi')) return 2;
    if (pathname.startsWith('/cum-lucram')) return 3;
    if (pathname.startsWith('/contact')) return 4;
    if (pathname.startsWith('/cere-oferta')) return 7;
    if (pathname.startsWith('/programeaza-discutie')) return 8;
  } catch (_e) {}
  return 1;
}

function isLikelyIp(value) {
  if (!value) return false;
  const ipv4 = /^\d{1,3}(\.\d{1,3}){3}$/;
  if (ipv4.test(value)) return true;
  return /^[0-9a-f:]+$/i.test(value);
}

export const onRequestPost = async (context) => {
  const { request, env } = context;
  const databaseUrl = env?.HYPERDRIVE?.connectionString || env?.DATABASE_URL;

  if (!databaseUrl) {
    return jsonResponse({ success: false, error: 'Database not configured.' }, 500);
  }

  let payload;
  try {
    payload = await request.json();
  } catch (_error) {
    return jsonResponse({ success: false, error: 'Invalid JSON payload.' }, 400);
  }

  const { intent, data } = payload;
  const contactName = normalizeString(data?.name, 255);
  const contactEmail = normalizeString(data?.email, 255);
  const contactPhone = normalizeString(data?.phone, 50);
  const companyName = normalizeString(data?.company, 500);

  if (!contactName || !contactEmail || !EMAIL_REGEX.test(contactEmail) || !companyName) {
    return jsonResponse({ success: false, error: 'Campos obligatorii invalide.' }, 400);
  }

  const sourceUrl = normalizeString(request.headers.get('Referer'), 500) || '/';
  const sourcePageId = resolveSourcePageId(sourceUrl);

  const forwardedIp = normalizeString(request.headers.get('CF-Connecting-IP'), 64) || normalizeString(request.headers.get('X-Forwarded-For'), 64);
  const ipAddress = forwardedIp && isLikelyIp(forwardedIp.split(',')[0].trim()) ? forwardedIp.split(',')[0].trim() : null;
  const userAgent = normalizeString(request.headers.get('user-agent'), 5000);

  // Re-map answers into JSONB for the DB
  const answersJson = [];
  for (const [k, v] of Object.entries(data)) {
    if (['name', 'email', 'phone', 'company', 'q_other'].includes(k)) continue;
    // include the custom "other" string if applicable
    const valueStr = Array.isArray(v) ? v.join('; ') : String(v);
    const otherVal = data.q_other?.[k] ? ` (Specifiat: ${data.q_other[k]})` : '';
    answersJson.push({ question: k, answer: `${valueStr}${otherVal}` });
  }

  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    await client.query('BEGIN');

    const leadInsert = await client.query(
      `
      INSERT INTO lead_requests (
        source_page_id,
        source_url,
        contact_name,
        contact_email,
        contact_phone,
        company_name,
        ip_address,
        user_agent,
        message
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id
      `,
      [sourcePageId, sourceUrl, contactName, contactEmail, contactPhone, companyName, ipAddress, userAgent, "Generat prin formularul nou: " + intent]
    );

    const leadRequestId = leadInsert.rows[0]?.id;

    await client.query(
      `
      INSERT INTO website_lead_context (
        lead_request_id,
        conversion_intent,
        answers_json
      ) VALUES ($1, $2, $3::jsonb)
      ON CONFLICT (lead_request_id) DO UPDATE
      SET
        conversion_intent = EXCLUDED.conversion_intent,
        answers_json = EXCLUDED.answers_json
      `,
      [leadRequestId, intent, JSON.stringify(answersJson)]
    );

    await client.query('COMMIT');

    return jsonResponse({
      success: true,
      lead_request_id: leadRequestId,
    });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_e) {}
    console.error('Submit lead failed:', error);
    return jsonResponse({ success: false, error: 'DB Insert Error' }, 500);
  } finally {
    await client.end();
  }
};
