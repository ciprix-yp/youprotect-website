// POST /api/submit-lead — formularul în pași (src/components/forms/MultiStepForm.tsx).
//
// Cererea ajunge pe două căi independente, ca să nu se piardă dacă una cade:
//   1. inbox-ul D1 (binding LEADS_DB), de unde Prospector CRM o preia prin /api/crm/leads;
//   2. emailul de notificare prin Resend (RESEND_API_KEY) către echipa You Protect.
// Răspunsul e „success” dacă cel puțin una a reușit. Tag-ul cererii este „website”.
import {
  MAX_BODY_BYTES,
  MAX_LEADS_PER_IP_PER_HOUR,
  LEAD_TAG,
  environmentOf,
  isBotSubmission,
  isSameOrigin,
  jsonResponse,
  leadEmail,
  normalizeString,
  parseLead,
} from '../../server/leads.js';

const DEFAULT_FROM = 'You Protect website <noreply@deeplogic.ro>';
const DEFAULT_TO = 'office@youprotect.ro';

async function storeLead(db, lead) {
  await db
    .prepare(
      `INSERT INTO lead (id, created_at, environment, tag, intent, name, company, cui, phone, email, product,
                         answers, source_url, user_agent, ip)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)`,
    )
    .bind(
      lead.id, lead.createdAt, lead.environment, LEAD_TAG, lead.intent, lead.name, lead.company, lead.cui,
      lead.phone, lead.email, lead.product, JSON.stringify(lead.answers), lead.sourceUrl, lead.userAgent, lead.ip,
    )
    .run();
}

// Câte cereri am salvat de la același IP în ultima oră (tabelul e mic: cererile se șterg după preluare + 30 de zile).
async function recentLeadsFromIp(db, ip) {
  const since = new Date(Date.now() - 3_600_000).toISOString();
  const row = await db.prepare('SELECT COUNT(*) AS n FROM lead WHERE ip = ?1 AND created_at > ?2').bind(ip, since).first();
  return Number(row?.n ?? 0);
}

async function sendEmail(env, lead) {
  const { subject, text } = leadEmail(lead);
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': `lead-${lead.id}`,
    },
    body: JSON.stringify({
      from: env.LEAD_NOTIFY_FROM || DEFAULT_FROM,
      to: (env.LEAD_NOTIFY_TO || DEFAULT_TO).split(',').map((s) => s.trim()).filter(Boolean),
      reply_to: lead.email,
      subject,
      text,
      tags: [
        { name: 'source', value: LEAD_TAG },
        { name: 'intent', value: lead.intent },
        { name: 'environment', value: lead.environment },
      ],
    }),
  });
  if (!response.ok) throw new Error(`Resend HTTP ${response.status}`);
}

async function markEmail(db, id, error) {
  await db
    .prepare('UPDATE lead SET email_sent_at = ?2, email_error = ?3 WHERE id = ?1')
    .bind(id, error ? null : new Date().toISOString(), error ? String(error).slice(0, 200) : null)
    .run();
}

export const onRequestPost = async (context) => {
  const { request, env } = context;

  if (!isSameOrigin(request)) return jsonResponse({ success: false, error: 'Cererea nu vine din formularul site-ului.' }, 403);
  if (Number(request.headers.get('content-length') || 0) > MAX_BODY_BYTES) {
    return jsonResponse({ success: false, error: 'Cererea e prea mare.' }, 413);
  }
  let payload;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return jsonResponse({ success: false, error: 'Cererea e prea mare.' }, 413);
    payload = JSON.parse(raw);
  } catch (_error) {
    return jsonResponse({ success: false, error: 'Date invalide.' }, 400);
  }

  if (isBotSubmission(payload)) {
    console.warn('submit-lead: câmpul-capcană completat, cerere ignorată');
    return jsonResponse({ success: true, id: crypto.randomUUID() });
  }

  const parsed = parseLead(payload);
  if (!parsed.ok) return jsonResponse({ success: false, error: parsed.error }, 400);

  const forwardedIp = normalizeString(request.headers.get('CF-Connecting-IP'), 64);
  const lead = {
    ...parsed.lead,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    environment: environmentOf(new URL(request.url).hostname),
    sourceUrl: normalizeString(request.headers.get('Referer'), 500),
    userAgent: normalizeString(request.headers.get('user-agent'), 500),
    ip: forwardedIp && /^[0-9a-f:.]+$/i.test(forwardedIp) ? forwardedIp : null,
  };

  if (env.LEADS_DB && lead.ip) {
    try {
      if ((await recentLeadsFromIp(env.LEADS_DB, lead.ip)) >= MAX_LEADS_PER_IP_PER_HOUR) {
        return jsonResponse(
          { success: false, error: 'Am primit deja mai multe cereri de la tine în ultima oră. Sună-ne la 0742 226 127 dacă e urgent.' },
          429,
        );
      }
    } catch (error) {
      // Dacă numărarea nu merge, nu blocăm un client real: cererea continuă.
      console.error('submit-lead: rate limit check failed', error);
    }
  }

  let stored = false;
  if (env.LEADS_DB) {
    try {
      await storeLead(env.LEADS_DB, lead);
      stored = true;
    } catch (error) {
      console.error('submit-lead: D1 insert failed', error);
    }
  }

  const canEmail = Boolean(env.RESEND_API_KEY);
  if (stored) {
    // Cererea e deja salvată: emailul pleacă după răspuns, iar rezultatul lui se notează în D1.
    if (canEmail) {
      context.waitUntil(
        sendEmail(env, lead)
          .then(() => markEmail(env.LEADS_DB, lead.id, null))
          .catch((error) => {
            console.error('submit-lead: email failed', error);
            return markEmail(env.LEADS_DB, lead.id, error).catch(() => {});
          }),
      );
    }
    return jsonResponse({ success: true, id: lead.id });
  }

  if (canEmail) {
    try {
      await sendEmail(env, lead);
      return jsonResponse({ success: true, id: lead.id });
    } catch (error) {
      console.error('submit-lead: email failed and D1 unavailable', error);
    }
  }
  // Fără detalii despre ce a căzut (D1, email, configurație): rămân în log, nu în răspuns.
  return jsonResponse({ success: false, error: 'Nu am putut trimite cererea. Încearcă din nou sau sună-ne.' }, 500);
};
