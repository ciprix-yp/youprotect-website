import { Client } from 'pg';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_BOOKINGS_URL = 'https://outlook.office.com/book/Booking@youprotect.ro/?ismsaljsauthenabled';
const MAX_WIZARD_QUESTIONS = 10;

const ALLOWED_URGENCY = new Set(['urgent', 'normal', 'planificare', 'explorare']);
const ALLOWED_EQUIPMENT = new Set(['imbracaminte', 'incaltaminte', 'accesorii', 'complet']);
const ALLOWED_TEAM_SIZE = new Set(['3_5', '6_20', '21_50', '50_plus']);
const ALLOWED_DECISION_STAGE = new Set([
  'pilot_activ',
  'compar_oferte',
  'buget_aprobat',
  'research',
]);
const ALLOWED_PAIN_POINTS = new Set([
  'confort_scazut',
  'durata_mica',
  'conformitate',
  'imagine_neunitara',
  'livrare_instabila',
]);
const ALLOWED_DESIRED_OUTCOMES = new Set([
  'rata_purtare',
  'cost_total',
  'conformitate_audit',
  'imagine_profesionala',
  'predictibilitate',
]);
const ALLOWED_PAYMENT_METHODS = new Set([
  'integral_la_comanda',
  'partial_50_la_comanda',
  'la_termen_instrument_plata',
]);

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

function normalizeEnum(rawValue, allowedValues, maxLength = 100) {
  const value = normalizeString(rawValue, maxLength);
  if (!value || !allowedValues.has(value)) {
    return null;
  }
  return value;
}

function normalizeStringArray(rawItems, options = {}) {
  const { allowedValues = null, maxItems = 10, itemMaxLength = 120 } = options;

  if (!Array.isArray(rawItems)) {
    return [];
  }

  const output = [];
  const seen = new Set();

  for (const rawItem of rawItems) {
    const value = normalizeString(rawItem, itemMaxLength);
    if (!value || seen.has(value)) {
      continue;
    }

    if (allowedValues && !allowedValues.has(value)) {
      continue;
    }

    seen.add(value);
    output.push(value);

    if (output.length >= maxItems) {
      break;
    }
  }

  return output;
}

function calculateQualificationScore({ intent, urgency, equipment, teamSize, decisionStage, painPoints, desiredOutcomes, paymentMethod }) {
  const urgencyScore = {
    urgent: 18,
    normal: 14,
    planificare: 9,
    explorare: 4,
  };

  const equipmentScore = {
    complet: 16,
    imbracaminte: 12,
    incaltaminte: 12,
    accesorii: 9,
  };

  const teamScore = {
    '3_5': 8,
    '6_20': 12,
    '21_50': 16,
    '50_plus': 20,
  };

  const decisionScore = {
    pilot_activ: 22,
    compar_oferte: 17,
    buget_aprobat: 20,
    research: 8,
  };

  const paymentScore = {
    integral_la_comanda: 12,
    partial_50_la_comanda: 8,
    la_termen_instrument_plata: 5,
  };

  let score = 0;
  score += urgencyScore[urgency] || 0;
  score += equipmentScore[equipment] || 0;
  score += teamScore[teamSize] || 0;
  score += decisionScore[decisionStage] || 0;
  score += Math.min((painPoints?.length || 0) * 5, 15);
  score += Math.min((desiredOutcomes?.length || 0) * 4, 12);

  if (intent === 'view_samples') {
    score += paymentScore[paymentMethod] || 0;
  }

  return Math.max(0, Math.min(100, Math.round(score * 100) / 100));
}

function buildNeedsSummary({ intent, urgency, equipment, teamSize, decisionStage, painPoints, desiredOutcomes, paymentMethod }) {
  const parts = [
    `intent=${intent}`,
    `urgenta=${urgency || '-'}`,
    `echipament=${equipment || '-'}`,
    `team_size=${teamSize || '-'}`,
    `decision_stage=${decisionStage || '-'}`,
    `pain_points=${painPoints.length ? painPoints.join(', ') : '-'}`,
    `desired_outcomes=${desiredOutcomes.length ? desiredOutcomes.join(', ') : '-'}`,
  ];

  if (intent === 'view_samples') {
    parts.push(`payment_method=${paymentMethod || '-'}`);
  }

  return parts.join(' | ');
}

function normalizeIsoDateTime(rawValue) {
  const value = normalizeString(rawValue, 100);
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
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
  const hyperdriveUrl = normalizeString(env?.HYPERDRIVE?.connectionString);
  const databaseUrl = hyperdriveUrl || normalizeString(env?.DATABASE_URL);

  if (!databaseUrl) {
    return jsonResponse(
      { success: false, error: 'No database binding configured (HYPERDRIVE/DATABASE_URL).' },
      500
    );
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
  const urgency = normalizeEnum(payload.urgenta, ALLOWED_URGENCY);
  const equipment = normalizeEnum(payload.echipament, ALLOWED_EQUIPMENT);
  const teamSize = normalizeEnum(payload.team_size, ALLOWED_TEAM_SIZE);
  const decisionStage = normalizeEnum(payload.decision_stage, ALLOWED_DECISION_STAGE);
  const painPoints = normalizeStringArray(payload.pain_points, {
    allowedValues: ALLOWED_PAIN_POINTS,
    maxItems: 3,
    itemMaxLength: 100,
  });
  const desiredOutcomes = normalizeStringArray(payload.desired_outcomes, {
    allowedValues: ALLOWED_DESIRED_OUTCOMES,
    maxItems: 3,
    itemMaxLength: 100,
  });
  const paymentMethodRaw = normalizeEnum(payload.payment_method, ALLOWED_PAYMENT_METHODS, 50);
  const paymentMethod = intent === 'view_samples' ? paymentMethodRaw : null;

  if (
    !urgency ||
    !equipment ||
    !teamSize ||
    !decisionStage ||
    painPoints.length === 0 ||
    desiredOutcomes.length === 0
  ) {
    return jsonResponse(
      {
        success: false,
        error: 'Completeaza toate raspunsurile obligatorii din wizard inainte de trimitere.',
      },
      400
    );
  }

  if (intent === 'view_samples' && selectedProducts.length === 0) {
    return jsonResponse(
      {
        success: false,
        error: 'Selecteaza cel putin un produs pentru fluxul de testare.',
      },
      400
    );
  }

  if (intent === 'view_samples' && !paymentMethod) {
    return jsonResponse(
      {
        success: false,
        error: 'Selecteaza metoda de plata pentru fluxul "Vreau sa testez".',
      },
      400
    );
  }

  const sourceUrl = normalizeString(payload.source_url, 500) || '/';
  const sourcePageId = resolveSourcePageId(sourceUrl);

  const utmSource = normalizeString(payload.utm_source, 100);
  const utmMedium = normalizeString(payload.utm_medium, 100);
  const utmCampaign = normalizeString(payload.utm_campaign, 100);
  const urgencyHint = urgency;
  const companySizeHint = teamSize;

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
    { question: 'urgenta', answer: urgency },
    { question: 'echipament', answer: equipment },
    { question: 'team_size', answer: teamSize },
    { question: 'decision_stage', answer: decisionStage },
    { question: 'pain_points', answer: painPoints },
    { question: 'desired_outcomes', answer: desiredOutcomes },
  ];

  if (intent === 'view_samples') {
    answersJson.push({ question: 'payment_method', answer: paymentMethod });
  }

  const wizardQuestionCount = Math.min(answersJson.length, MAX_WIZARD_QUESTIONS);
  const qualificationScore = calculateQualificationScore({
    intent,
    urgency,
    equipment,
    teamSize,
    decisionStage,
    painPoints,
    desiredOutcomes,
    paymentMethod,
  });
  const needsSummary =
    normalizeString(payload.needs_summary, 5000) ||
    buildNeedsSummary({
      intent,
      urgency,
      equipment,
      teamSize,
      decisionStage,
      painPoints,
      desiredOutcomes,
      paymentMethod,
    });
  const bookingUrlFromPayload = normalizeString(payload.booking_url, 2000);
  const bookingUrlFromEnv =
    normalizeString(env?.MICROSOFT_BOOKINGS_URL, 2000) ||
    normalizeString(env?.BOOKINGS_URL, 2000) ||
    DEFAULT_BOOKINGS_URL;
  const bookingUrl = intent === 'book_call' ? bookingUrlFromPayload || bookingUrlFromEnv : null;
  const bookingReferenceInput =
    intent === 'book_call' ? normalizeString(payload.booking_reference, 255) : null;
  const bookingSlotAt = intent === 'book_call' ? normalizeIsoDateTime(payload.booking_slot_at) : null;
  const hasConfirmedBooking = intent === 'book_call' && !!(bookingReferenceInput || bookingSlotAt);

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

    const contextUpsert = await client.query(
      `
      INSERT INTO website_lead_context (
        lead_request_id,
        conversion_intent,
        payment_method,
        qualification_score,
        wizard_question_count,
        answers_json,
        pain_points,
        desired_outcomes,
        needs_summary,
        company_size_hint,
        urgency_hint
      ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9, $10, $11)
      ON CONFLICT (lead_request_id) DO UPDATE
      SET
        conversion_intent = EXCLUDED.conversion_intent,
        payment_method = EXCLUDED.payment_method,
        qualification_score = EXCLUDED.qualification_score,
        wizard_question_count = EXCLUDED.wizard_question_count,
        answers_json = EXCLUDED.answers_json,
        pain_points = EXCLUDED.pain_points,
        desired_outcomes = EXCLUDED.desired_outcomes,
        needs_summary = EXCLUDED.needs_summary,
        company_size_hint = EXCLUDED.company_size_hint,
        urgency_hint = EXCLUDED.urgency_hint
      RETURNING qualification_score, qualification_label
      `,
      [
        leadRequestId,
        intent,
        paymentMethod,
        qualificationScore,
        wizardQuestionCount,
        JSON.stringify(answersJson),
        JSON.stringify(painPoints),
        JSON.stringify(desiredOutcomes),
        needsSummary,
        companySizeHint,
        urgencyHint,
      ]
    );

    const savedContext = contextUpsert.rows[0] || null;

    const bookingReference =
      intent === 'book_call' ? bookingReferenceInput || `pending_lead_${leadRequestId}` : null;
    const pipelineStage =
      intent === 'view_samples'
        ? 'offer_in_progress'
        : hasConfirmedBooking
          ? 'book_call_scheduled'
          : 'intake_new';

    const pipelineUpsert = await client.query(
      `
      INSERT INTO website_lead_pipeline (
        lead_request_id,
        operational_stage,
        first_confirmation_channel,
        booking_provider,
        booking_reference,
        booking_slot_at,
        booking_url
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (lead_request_id) DO UPDATE
      SET
        operational_stage = EXCLUDED.operational_stage,
        first_confirmation_channel = EXCLUDED.first_confirmation_channel,
        booking_provider = EXCLUDED.booking_provider,
        booking_reference = EXCLUDED.booking_reference,
        booking_slot_at = EXCLUDED.booking_slot_at,
        booking_url = EXCLUDED.booking_url
      RETURNING
        operational_stage,
        booking_provider,
        booking_reference,
        booking_slot_at,
        booking_url
      `,
      [
        leadRequestId,
        pipelineStage,
        'email',
        intent === 'book_call' ? 'microsoft_bookings' : null,
        bookingReference,
        bookingSlotAt,
        bookingUrl,
      ]
    );

    const savedPipeline = pipelineUpsert.rows[0] || null;

    await client.query(
      `
      INSERT INTO website_lead_events (
        lead_request_id,
        event_type,
        payload
      ) VALUES ($1, $2, $3::jsonb)
      `,
      [
        leadRequestId,
        'lead_submitted',
        JSON.stringify({
          conversion_intent: intent,
          pipeline_stage: savedPipeline?.operational_stage || pipelineStage,
          source_trigger: normalizeString(payload.source_trigger, 100),
        }),
      ]
    );

    await client.query('COMMIT');

    return jsonResponse({
      success: true,
      lead_request_id: leadRequestId,
      selected_products_count: selectedProducts.length,
      conversion_intent: intent,
      qualification_score: savedContext?.qualification_score ?? qualificationScore,
      qualification_label: savedContext?.qualification_label ?? null,
      pipeline_stage: savedPipeline?.operational_stage || pipelineStage,
      booking_reference: savedPipeline?.booking_reference ?? bookingReference ?? null,
      booking_slot_at: savedPipeline?.booking_slot_at ?? bookingSlotAt ?? null,
      booking_url: savedPipeline?.booking_url ?? bookingUrl ?? null,
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
