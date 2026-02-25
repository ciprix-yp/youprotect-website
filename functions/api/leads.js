import { Client } from 'pg';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeString(value, maxLength = null) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (maxLength && trimmed.length > maxLength) {
    return trimmed.slice(0, maxLength);
  }

  return trimmed;
}

function normalizeIntent(rawIntent) {
  return rawIntent === 'book_call' ? 'book_call' : 'view_samples';
}

function normalizeSelectedProducts(rawItems) {
  if (!Array.isArray(rawItems)) {
    return [];
  }

  const seen = new Set();
  const output = [];

  for (const rawItem of rawItems) {
    if (!rawItem || typeof rawItem !== 'object') {
      continue;
    }

    const id = normalizeString(rawItem.id, 64);
    if (!id || !UUID_REGEX.test(id) || seen.has(id)) {
      continue;
    }

    seen.add(id);
    output.push({
      id,
      selected_from: normalizeString(rawItem.selected_from, 30) || 'catalog',
    });

    if (output.length >= 12) {
      break;
    }
  }

  return output;
}

function parsePathname(sourceUrl) {
  if (!sourceUrl) {
    return '/';
  }

  try {
    if (sourceUrl.startsWith('http://') || sourceUrl.startsWith('https://')) {
      return new URL(sourceUrl).pathname;
    }
  } catch (_error) {
    // Ignore and use raw string fallback.
  }

  return sourceUrl.startsWith('/') ? sourceUrl : '/';
}

function resolveSourcePageId(sourceUrl) {
  const pathname = parsePathname(sourceUrl);

  if (pathname.startsWith('/produse')) return 6;
  if (pathname.startsWith('/despre-noi')) return 2;
  if (pathname.startsWith('/cum-lucram')) return 3;
  if (pathname.startsWith('/contact')) return 4;
  return 1;
}

function isLikelyIp(value) {
  if (!value) return false;

  const ipv4 = /^\d{1,3}(\.\d{1,3}){3}$/;
  const ipv6 = /^[0-9a-f:]+$/i;

  if (ipv4.test(value)) {
    return value
      .split('.')
      .map((part) => Number(part))
      .every((part) => part >= 0 && part <= 255);
  }

  return ipv6.test(value);
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

export const onRequestPost = async (context) => {
  const { request, env } = context;
  const databaseUrl = env?.DATABASE_URL;

  if (!databaseUrl) {
    return jsonResponse({ success: false, error: 'DATABASE_URL is missing.' }, 500);
  }

  let payload;
  try {
    payload = await request.json();
  } catch (_error) {
    return jsonResponse({ success: false, error: 'Payload JSON invalid.' }, 400);
  }

  const contactName = normalizeString(payload.nume, 255);
  const contactEmail = normalizeString(payload.email, 255);
  const contactPhone = normalizeString(payload.telefon, 50);
  const companyName = normalizeString(payload.companie, 500);
  const message = normalizeString(payload.mesaj, 5000);

  if (!contactName || contactName.length < 3) {
    return jsonResponse({ success: false, error: 'Numele este obligatoriu.' }, 400);
  }

  if (!contactEmail || !EMAIL_REGEX.test(contactEmail)) {
    return jsonResponse({ success: false, error: 'Email invalid.' }, 400);
  }

  if (!companyName) {
    return jsonResponse({ success: false, error: 'Compania este obligatorie.' }, 400);
  }

  const selectedProducts = normalizeSelectedProducts(payload.selected_products);
  const intent = normalizeIntent(payload.conversion_intent);

  if (intent === 'view_samples' && selectedProducts.length === 0) {
    return jsonResponse(
      {
        success: false,
        error: 'Selecteaza cel putin un produs pentru fluxul de testare.',
      },
      400
    );
  }

  const sourceUrl = normalizeString(payload.source_url, 500) || '/';
  const sourcePageId = resolveSourcePageId(sourceUrl);

  const utmSource = normalizeString(payload.utm_source, 100);
  const utmMedium = normalizeString(payload.utm_medium, 100);
  const utmCampaign = normalizeString(payload.utm_campaign, 100);
  const urgencyHint = normalizeString(payload.urgenta, 100);

  const userAgent =
    normalizeString(payload.user_agent, 5000) ||
    normalizeString(request.headers.get('user-agent'), 5000);

  const forwardedIp =
    normalizeString(request.headers.get('CF-Connecting-IP'), 64) ||
    normalizeString(request.headers.get('X-Forwarded-For'), 64);

  const ipAddress = forwardedIp && isLikelyIp(forwardedIp.split(',')[0].trim())
    ? forwardedIp.split(',')[0].trim()
    : null;

  const firstProductId = selectedProducts.length > 0 ? selectedProducts[0].id : null;

  const answersJson = [
    {
      question: 'urgenta',
      answer: normalizeString(payload.urgenta, 100) || null,
    },
    {
      question: 'echipament',
      answer: normalizeString(payload.echipament, 100) || null,
    },
  ];

  const client = new Client({
    connectionString: databaseUrl,
    ssl: {
      rejectUnauthorized: false,
    },
  });

  try {
    await client.connect();
    await client.query('BEGIN');

    const leadInsert = await client.query(
      `
      INSERT INTO lead_requests (
        source_page_id,
        source_url,
        utm_source,
        utm_medium,
        utm_campaign,
        contact_name,
        contact_email,
        contact_phone,
        company_name,
        message,
        product_id,
        ip_address,
        user_agent
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13
      )
      RETURNING id
      `,
      [
        sourcePageId,
        sourceUrl,
        utmSource,
        utmMedium,
        utmCampaign,
        contactName,
        contactEmail,
        contactPhone,
        companyName,
        message,
        firstProductId,
        ipAddress,
        userAgent,
      ]
    );

    const leadRequestId = leadInsert.rows[0]?.id;

    for (let index = 0; index < selectedProducts.length; index += 1) {
      const product = selectedProducts[index];
      await client.query(
        `
        INSERT INTO lead_request_products (
          lead_request_id,
          product_id,
          sort_order,
          selected_from
        ) VALUES ($1, $2, $3, $4)
        ON CONFLICT (lead_request_id, product_id) DO NOTHING
        `,
        [leadRequestId, product.id, index, product.selected_from]
      );
    }

    await client.query(
      `
      INSERT INTO website_lead_context (
        lead_request_id,
        conversion_intent,
        wizard_question_count,
        answers_json,
        urgency_hint
      ) VALUES ($1, $2, $3, $4::jsonb, $5)
      ON CONFLICT (lead_request_id) DO UPDATE
      SET
        conversion_intent = EXCLUDED.conversion_intent,
        wizard_question_count = EXCLUDED.wizard_question_count,
        answers_json = EXCLUDED.answers_json,
        urgency_hint = EXCLUDED.urgency_hint
      `,
      [
        leadRequestId,
        intent,
        2,
        JSON.stringify(answersJson),
        urgencyHint,
      ]
    );

    await client.query('COMMIT');

    return jsonResponse({
      success: true,
      lead_request_id: leadRequestId,
      selected_products_count: selectedProducts.length,
      conversion_intent: intent,
    });
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (_rollbackError) {
      // Ignore rollback failures.
    }
    console.error('Lead insert failed:', error);

    return jsonResponse(
      {
        success: false,
        error: 'Nu am putut salva cererea in acest moment. Incearca din nou.',
      },
      500
    );
  } finally {
    await client.end();
  }
};
