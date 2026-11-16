import { Client } from 'pg';

// POST /api/submit-lead — primește formularul în pași (src/components/forms/MultiStepForm.tsx).
// Conexiunea trece prin Hyperdrive: Cloudflare face TLS spre Postgres (Railway) în configurația
// Hyperdrive, deci clientul nu are opțiuni ssl proprii (fără rejectUnauthorized: false).

const MAX_BODY_BYTES = 20_000;
const MAX_ANSWER_LENGTH = 300;
const MAX_ANSWER_ITEMS = 8;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PRODUCT_SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+){1,15}$/;

// Întrebările pe care le are fiecare formular. Orice alt câmp trimis de client e ignorat.
const QUESTIONS = {
  consultation: ['q1', 'q2', 'q3', 'q4', 'q5', 'q6'],
  quote: ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7'],
};

function normalizeString(value, maxLength = null) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (maxLength && trimmed.length > maxLength) return trimmed.slice(0, maxLength);
  return trimmed;
}

function normalizeAnswer(value) {
  if (Array.isArray(value)) {
    const items = value
      .map((item) => normalizeString(item, MAX_ANSWER_LENGTH))
      .filter(Boolean)
      .slice(0, MAX_ANSWER_ITEMS);
    return items.length ? items.join('; ') : null;
  }
  return normalizeString(value, MAX_ANSWER_LENGTH);
}

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
    if (pathname.startsWith('/cere-oferta')) return 4;
    if (pathname.startsWith('/programeaza-discutie')) return 4;
  } catch (_e) {
    // URL invalid: pagina implicită.
  }
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
  const databaseUrl = env?.HYPERDRIVE?.connectionString;

  if (!databaseUrl) {
    console.error('submit-lead: binding-ul HYPERDRIVE lipsește');
    return jsonResponse({ success: false, error: 'Serviciul nu e disponibil momentan.' }, 503);
  }

  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (declaredLength > MAX_BODY_BYTES) {
    return jsonResponse({ success: false, error: 'Cererea e prea mare.' }, 413);
  }

  let payload;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) {
      return jsonResponse({ success: false, error: 'Cererea e prea mare.' }, 413);
    }
    payload = JSON.parse(raw);
  } catch (_error) {
    return jsonResponse({ success: false, error: 'Date invalide.' }, 400);
  }

  const intent = payload?.intent;
  const data = payload?.data;
  if (!Object.hasOwn(QUESTIONS, intent) || typeof data !== 'object' || data === null || Array.isArray(data)) {
    return jsonResponse({ success: false, error: 'Date invalide.' }, 400);
  }

  // Valorile din DB rămân cele de până acum: quote -> view_samples, consultation -> book_call.
  const dbIntent = intent === 'quote' ? 'view_samples' : 'book_call';
  const contactName = normalizeString(data.name, 255);
  const contactEmail = normalizeString(data.email, 255);
  const contactPhone = normalizeString(data.phone, 50);
  const companyName = normalizeString(data.company, 500);

  if (!contactName || !contactEmail || !EMAIL_REGEX.test(contactEmail) || !companyName) {
    return jsonResponse({ success: false, error: 'Completează numele, compania și un email valid.' }, 400);
  }

  const others = typeof data.q_other === 'object' && data.q_other !== null ? data.q_other : {};
  const answersJson = [];
  for (const key of QUESTIONS[intent]) {
    const answer = normalizeAnswer(data[key]);
    if (!answer) continue;
    const other = Object.hasOwn(others, key) ? normalizeString(others[key], MAX_ANSWER_LENGTH) : null;
    answersJson.push({ question: key, answer: other ? `${answer} (Specificat: ${other})` : answer });
  }

  const productSlug = normalizeString(data.produs, 120);
  const product = productSlug && PRODUCT_SLUG_REGEX.test(productSlug) ? productSlug : null;
  if (product) answersJson.push({ question: 'produs', answer: product });

  const sourceUrl = normalizeString(request.headers.get('Referer'), 500) || '/';
  const sourcePageId = resolveSourcePageId(sourceUrl);

  const forwardedIp =
    normalizeString(request.headers.get('CF-Connecting-IP'), 64) ||
    normalizeString(request.headers.get('X-Forwarded-For'), 64);
  const ipAddress =
    forwardedIp && isLikelyIp(forwardedIp.split(',')[0].trim()) ? forwardedIp.split(',')[0].trim() : null;
  const userAgent = normalizeString(request.headers.get('user-agent'), 1000);
  const message = `Generat prin formularul nou: ${intent}${product ? ` · produs: ${product}` : ''}`;

  const client = new Client({ connectionString: databaseUrl });
  // Etapa curentă: apare în răspunsul de eroare (fără mesajul intern), ca să știm ce a picat.
  let stage = 'connect';

  try {
    await client.connect();
    stage = 'lead';
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
      [sourcePageId, sourceUrl, contactName, contactEmail, contactPhone, companyName, ipAddress, userAgent, message]
    );

    const leadRequestId = leadInsert.rows[0]?.id;

    stage = 'context';
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
      [leadRequestId, dbIntent, JSON.stringify(answersJson)]
    );

    stage = 'commit';
    await client.query('COMMIT');

    return jsonResponse({ success: true, lead_request_id: leadRequestId });
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (_e) {
      // Conexiunea poate fi deja închisă.
    }
    // Mesajul intern rămâne în logurile Cloudflare. Clientul primește doar etapa și codul tehnic
    // (SQLSTATE, ex. 28P01, sau codul de rețea, ex. ECONNREFUSED), care nu conțin date.
    console.error('submit-lead failed:', stage, error);
    const code = typeof error?.code === 'string' && /^[A-Z0-9_]{2,40}$/.test(error.code) ? error.code : undefined;
    return jsonResponse({ success: false, error: 'Nu am putut salva cererea. Încearcă din nou.', stage, code }, 500);
  } finally {
    await client.end().catch(() => {});
  }
};
