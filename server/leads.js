// Logica cererilor din formularul de pe site, folosită de functions/api/submit-lead.js și
// functions/api/crm/leads.js. Fără dependențe: rulează în Cloudflare Pages Functions și în `node --test`.
import { isValidCUI, normalizeCUI } from '../src/lib/cui.js';
import { DETAILS_MAX_LENGTH, EMAIL_REGEX } from '../src/lib/lead-limits.js';
import { HONEYPOT_FIELD } from '../src/lib/honeypot.js';
import { LEAD_QUESTIONS } from '../src/lib/lead-questions.js';
import { PERSONALIZATION_ANSWERS, quoteCategoryLabel } from '../src/lib/quote-categories.js';
import { computeTco, parseTcoInputs, tcoAnswers } from '../src/lib/tco.js';

export { DETAILS_MAX_LENGTH, HONEYPOT_FIELD };

export const MAX_BODY_BYTES = 20_000;
const MAX_ANSWER_LENGTH = 300;
const MAX_ANSWER_ITEMS = 8;
const PRODUCT_SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+){1,15}$/;
export const LEAD_TAG = 'website';

// Întrebările fiecărui formular (src/lib/lead-questions.js, aceleași ca pașii din MultiStepForm.tsx). Orice alt câmp
// trimis de client e ignorat.
export const QUESTIONS = LEAD_QUESTIONS;

// Întrebări cu răspunsuri fixe: altă valoare se ignoră, ca CRM-ul să primească doar variantele convenite.
const FIXED_ANSWERS = { quote: { personalizare: PERSONALIZATION_ANSWERS } };

// Textul întrebărilor, pentru email și pentru CRM (aceleași formulări ca în formular).
export const QUESTION_LABELS = {
  consultation: {
    q1: 'Rol în firmă',
    q2: 'Câți colegi',
    q3: 'Domeniu',
  },
  quote: {
    q1: 'Câți colegi',
    q2: 'Domeniu',
    q3: 'Produse vizate',
    personalizare: 'Personalizare cu logo',
    q4: 'Situația actuală',
    q5: 'Ce trebuie să rezolve oferta',
    q6: 'Termen',
    q7: 'Cum continuăm',
  },
};

export const INTENT_LABELS = { quote: 'Cerere de ofertă', consultation: 'Programare discuție' };
const DETAILS_LABELS = { quote: 'Cantități, mărimi, coduri', consultation: 'Despre ce vrea să vorbim' };

export function normalizeString(value, maxLength = null) {
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

/**
 * Validează corpul cererii ({ intent, data }) și întoarce cererea curățată.
 * @returns {{ ok: true, lead: object } | { ok: false, error: string }}
 */
export function parseLead(payload) {
  const intent = payload?.intent;
  const data = payload?.data;
  if (!Object.hasOwn(QUESTIONS, intent) || typeof data !== 'object' || data === null || Array.isArray(data)) {
    return { ok: false, error: 'Date invalide.' };
  }
  const name = normalizeString(data.name, 255);
  const email = normalizeString(data.email, 255);
  const phone = normalizeString(data.phone, 50);
  const company = normalizeString(data.company, 300);
  if (!name || !email || !EMAIL_REGEX.test(email) || !company) {
    return { ok: false, error: 'Completează numele, firma și un email valid.' };
  }
  const rawCui = normalizeString(data.cui, 20);
  if (rawCui && !isValidCUI(rawCui)) {
    return { ok: false, error: 'CUI-ul nu pare corect. Verifică cifrele sau lasă câmpul gol.' };
  }

  const others = typeof data.q_other === 'object' && data.q_other !== null ? data.q_other : {};
  const answers = [];
  for (const key of QUESTIONS[intent]) {
    const answer = normalizeAnswer(data[key]);
    if (!answer) continue;
    const allowed = FIXED_ANSWERS[intent]?.[key];
    if (allowed && !allowed.includes(answer)) continue;
    const other = Object.hasOwn(others, key) ? normalizeString(others[key], MAX_ANSWER_LENGTH) : null;
    answers.push({
      question: key,
      label: QUESTION_LABELS[intent][key],
      answer: other ? `${answer} (Specificat: ${other})` : answer,
    });
  }
  // Câmpul liber de la contact: la ofertă cantități, mărimi, coduri; la programare despre ce vrea clientul să vorbim.
  // Răspuns în contract, anunțat CRM-ului (Prospector) pe 19.11.2026 (ofertă) și 20.11.2026 (programare): question
  // „detalii”, text de cel mult DETAILS_MAX_LENGTH caractere.
  const details = normalizeString(data.detalii, DETAILS_MAX_LENGTH);
  if (details) {
    answers.push({ question: 'detalii', label: DETAILS_LABELS[intent], answer: details });
  }
  // Categoria din /cere-oferta/?categorie=<slug> (cardurile de pe homepage). Doar slug-uri din listă.
  const category = intent === 'quote' ? quoteCategoryLabel(data.categorie) : null;
  if (category) answers.unshift({ question: 'categorie', label: 'Categoria aleasă pe site', answer: category });

  // Cererile din calculatorul de cost vin ca cerere de ofertă (intent „quote”), ca să intre în CRM fără un intent
  // nou. Rezumatul se recalculează aici din datele introduse; cifrele trimise de browser nu se folosesc.
  if (intent === 'quote' && data.calculator !== undefined) {
    const inputs = parseTcoInputs(data.calculator);
    if (!inputs) return { ok: false, error: 'Datele din calculator nu sunt complete.' };
    answers.unshift(...tcoAnswers(inputs, computeTco(inputs)));
  }

  const productSlug = normalizeString(data.produs, 120);
  const product = productSlug && PRODUCT_SLUG_REGEX.test(productSlug) ? productSlug : null;

  return {
    ok: true,
    lead: { intent, name, email, phone, company, cui: rawCui ? normalizeCUI(rawCui) : null, product, answers },
  };
}

/** Cererile de pe youprotect.ro sunt „production”; cele de pe preview-urile Cloudflare sunt „preview” (test).
 *  youprotect-website.pages.dev servește tot producția (aceeași versiune ca youprotect.ro), deci e „production”;
 *  preview-urile sunt subdomenii ale lui (<hash>. sau <branch>.youprotect-website.pages.dev). */
const PRODUCTION_HOSTS = new Set(['youprotect.ro', 'www.youprotect.ro', 'youprotect-website.pages.dev']);
export function environmentOf(hostname) {
  return PRODUCTION_HOSTS.has(hostname) ? 'production' : 'preview';
}

/** Câmpul-capcană din formulare (ascuns pentru oameni, src/components/forms/Honeypot.tsx). Un robot care completează
 *  toate câmpurile îl completează și pe el; atunci răspundem „succes”, dar nu salvăm și nu trimitem nimic. */
export function isBotSubmission(payload) {
  const value = payload?.data?.[HONEYPOT_FIELD];
  return typeof value === 'string' && value.trim() !== '';
}

/** Cererea vine din formularul de pe același site: browserul trimite antetul Origin la orice POST făcut cu fetch.
 *  Un script care postează direct, fără Origin sau de pe alt site, e refuzat. */
export function isSameOrigin(request) {
  const origin = request.headers.get('Origin');
  return origin !== null && origin === new URL(request.url).origin;
}

/** Câte cereri salvăm de la același IP într-o oră. Un client real trimite una-două. */
export const MAX_LEADS_PER_IP_PER_HOUR = 5;

/** Cererile preluate de CRM se șterg din D1 după atâtea zile (politica de confidențialitate). */
export const SYNCED_RETENTION_DAYS = 30;

// Fără CR/LF în subiect (header injection) și fără caractere de control.
const oneLine = (s) => String(s ?? '').replace(/[\r\n\t\u0000-\u001f]+/g, ' ').trim();

/** Emailul de notificare: doar text (nu HTML), ca datele trimise de vizitator să nu poată injecta marcaj. */
export function leadEmail(lead, siteUrl = 'https://youprotect.ro') {
  const test = lead.environment !== 'production';
  const subject = oneLine(
    `${test ? '[TEST] ' : ''}[${LEAD_TAG}] ${INTENT_LABELS[lead.intent]}: ${lead.company}`.slice(0, 180),
  );
  const lines = [
    `${INTENT_LABELS[lead.intent]} de pe site (tag: ${LEAD_TAG})${test ? ' — TEST, trimisă de pe un preview' : ''}`,
    '',
    `Nume: ${lead.name}`,
    `Firma: ${lead.company}`,
    `CUI: ${lead.cui ?? 'necompletat'}`,
    `Telefon: ${lead.phone ?? '-'}`,
    `Email: ${lead.email}`,
  ];
  if (lead.product) lines.push(`Produs: ${siteUrl}/produse/${lead.product}/`);
  if (lead.answers.length) {
    lines.push('', 'Răspunsuri:');
    for (const a of lead.answers) lines.push(`- ${a.label}: ${a.answer}`);
  }
  lines.push('', `Trimisă: ${lead.createdAt}`, `Pagina: ${lead.sourceUrl ?? '-'}`, `ID: ${lead.id}`);
  lines.push('', 'Răspunde direct la acest email ca să-i scrii persoanei (Reply-To).');
  return { subject, text: lines.join('\n') };
}

/** Compară două șiruri în timp constant (token-ul de sincronizare al CRM-ului). */
export function safeEqual(a, b) {
  const enc = new TextEncoder();
  const x = enc.encode(String(a));
  const y = enc.encode(String(b));
  if (x.length !== y.length) {
    // Comparație de aceeași durată, ca lungimea să nu se poată deduce din timp.
    crypto.subtle.timingSafeEqual?.(x, x);
    return false;
  }
  if (crypto.subtle.timingSafeEqual) return crypto.subtle.timingSafeEqual(x, y);
  let diff = 0;
  for (let i = 0; i < x.length; i += 1) diff |= x[i] ^ y[i];
  return diff === 0;
}

export function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
