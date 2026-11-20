// Teste pentru fluxul cererilor de pe site: node --test tests/
// D1 și Resend sunt simulate; nimic nu pleacă în rețea.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidCUI, normalizeCUI } from '../src/lib/cui.js';
import { parseLead, leadEmail, environmentOf, safeEqual } from '../server/leads.js';
import { computeTco, parseTcoInputs } from '../src/lib/tco.js';
import { onRequestPost as submitLead } from '../functions/api/submit-lead.js';
import { onRequestGet as crmGet, onRequestPost as crmPost } from '../functions/api/crm/leads.js';

const TOKEN = 'x'.repeat(40);

// D1 minimal în memorie: reține tabelul `lead` ca listă de obiecte.
function fakeD1({ failInsert = false } = {}) {
  const rows = [];
  const db = {
    rows,
    prepare(sql) {
      const stmt = {
        args: [],
        bind(...args) {
          stmt.args = args;
          return stmt;
        },
        async run() {
          if (sql.startsWith('INSERT INTO lead')) {
            if (failInsert) throw new Error('D1 down');
            const [id, created_at, environment, tag, intent, name, company, cui, phone, email, product, answers] = stmt.args;
            rows.push({ id, created_at, environment, tag, intent, name, company, cui, phone, email, product, answers, synced_at: null });
          } else if (sql.startsWith('UPDATE lead SET email_sent_at')) {
            const row = rows.find((r) => r.id === stmt.args[0]);
            if (row) Object.assign(row, { email_sent_at: stmt.args[1], email_error: stmt.args[2] });
          } else if (sql.startsWith('UPDATE lead SET synced_at')) {
            const row = rows.find((r) => r.id === stmt.args[0] && !r.synced_at);
            if (row) Object.assign(row, { synced_at: stmt.args[1], crm_ref: stmt.args[2] });
          }
          return { success: true };
        },
        async all() {
          const [includePreview, limit] = stmt.args;
          const results = rows
            .filter((r) => !r.synced_at && (r.environment === 'production' || includePreview === 1))
            .slice(0, limit);
          return { results };
        },
      };
      return stmt;
    },
    async batch(statements) {
      for (const s of statements) await s.run();
    },
  };
  return db;
}

function stubFetch(status = 200) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return new Response('{}', { status });
  };
  return calls;
}

function ctx(body, { host = 'youprotect.ro', env = {} } = {}) {
  const pending = [];
  return {
    request: new Request(`https://${host}/api/submit-lead`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Referer: `https://${host}/cere-oferta/`, 'CF-Connecting-IP': '203.0.113.7' },
      body: JSON.stringify(body),
    }),
    env,
    waitUntil: (p) => pending.push(p),
    pending,
  };
}

const valid = {
  intent: 'quote',
  data: {
    name: 'Ion Popescu', company: 'Exemplu SRL', cui: 'RO46294850', phone: '0722123456', email: 'ion@exemplu.ro',
    q1: '5–15 persoane', q3: ['Încălțăminte de protecție'], q_other: {}, produs: 'tricou-polo-mascot-bandol-51587',
    hacker: 'ignorat',
  },
};

test('CUI: cifra de control', () => {
  assert.equal(isValidCUI('RO46294850'), true); // CUI-ul You Protect
  assert.equal(isValidCUI('46294850'), true);
  assert.equal(isValidCUI('RO 46387843'), false); // vechiul CUI din footer, greșit
  assert.equal(isValidCUI('abc'), false);
  assert.equal(normalizeCUI(' ro 46294850 '), '46294850');
});

test('parseLead: validează și ignoră câmpurile necunoscute', () => {
  const r = parseLead(valid);
  assert.equal(r.ok, true);
  assert.equal(r.lead.cui, '46294850');
  assert.equal(r.lead.product, 'tricou-polo-mascot-bandol-51587');
  assert.deepEqual(r.lead.answers.map((a) => a.question), ['q1', 'q3']);
  assert.equal(JSON.stringify(r.lead).includes('hacker'), false);
  assert.equal(parseLead({ intent: 'x', data: {} }).ok, false);
  assert.equal(parseLead({ ...valid, data: { ...valid.data, email: 'nu-e-email' } }).ok, false);
  assert.equal(parseLead({ ...valid, data: { ...valid.data, cui: '123' } }).ok, false);
  assert.equal(parseLead({ ...valid, data: { ...valid.data, cui: '' } }).lead.cui, null);
});

test('parseLead: categoria de pe homepage, doar din listă și doar la cererea de ofertă', () => {
  const withCategory = (intent, categorie) => parseLead({ ...valid, intent, data: { ...valid.data, categorie } });
  const r = withCategory('quote', 'lucru-la-inaltime');
  assert.deepEqual(r.lead.answers[0], { question: 'categorie', label: 'Categoria aleasă pe site', answer: 'Lucru la înălțime' });
  assert.equal(withCategory('quote', '<script>').lead.answers[0].question, 'q1');
  assert.equal(withCategory('quote', 'constructor').lead.answers[0].question, 'q1'); // nu din prototipul obiectului
  assert.equal(withCategory('consultation', 'manusi').lead.answers.some((a) => a.question === 'categorie'), false);
});

test('parseLead: personalizarea, doar cu valorile convenite cu CRM-ul, după produse', () => {
  const quote = (data) => parseLead({ intent: 'quote', data: { ...valid.data, q1: '16–40', q3: ['Mănuși'], ...data } });
  const answers = quote({ personalizare: 'Nu știu încă' }).lead.answers;
  assert.deepEqual(answers.find((a) => a.question === 'personalizare'), {
    question: 'personalizare',
    label: 'Personalizare cu logo',
    answer: 'Nu știu încă',
  });
  assert.deepEqual(answers.map((a) => a.question), ['q1', 'q3', 'personalizare']);
  for (const bad of ['Poate', 'da', '<b>Da</b>', ['Da', 'Nu']]) {
    assert.equal(quote({ personalizare: bad }).lead.answers.some((a) => a.question === 'personalizare'), false);
  }
  const consultation = parseLead({ intent: 'consultation', data: { ...valid.data, personalizare: 'Da' } });
  assert.equal(consultation.lead.answers.some((a) => a.question === 'personalizare'), false);
});

test('calculator: model simplu, ipoteze la vedere (formula detaliată în tests/tco.test.mjs)', () => {
  const input = parseTcoInputs({
    employees: 10, categories: ['incaltaminte', 'necunoscut'], prices: { incaltaminte: 200 }, qualityPrices: { incaltaminte: 300 },
    months: { incaltaminte: 6 }, qty: { incaltaminte: 1 }, durability: 2, adminHours: 4, hourCost: 50, domain: 'Agricultură',
  });
  assert.deepEqual(input.categories, ['incaltaminte']);
  const r = computeTco(input);
  assert.equal(r.purchaseNow, 10 * 200 * 2); // 2 înlocuiri pe an
  assert.equal(r.purchaseQuality, (10 * 300 * 2) / 2); // durează de 2 ori mai mult
  assert.equal(r.adminNow, 4 * 12 * 50);
  assert.equal(r.adminQuality, r.adminNow / 2);
  assert.equal(r.difference, r.totalNow - r.totalQuality);
  // La pragul cu administrare, costul de calitate e egal cu cel de acum.
  const atBreakEven = computeTco({ ...input, durability: r.breakEvenWithAdmin });
  assert.ok(Math.abs(atBreakEven.totalQuality - r.totalNow) < 1e-6);
  // Limite și tipuri
  assert.equal(parseTcoInputs({ ...input, months: 5 }), null);
  assert.equal(parseTcoInputs({ ...input, categories: [] }), null);
  assert.equal(parseTcoInputs({ ...input, employees: '10' }), null);
  assert.equal(parseTcoInputs({ ...input, employees: 1e9, durability: 99 }).employees, 500);
  assert.equal(parseTcoInputs({ ...input, durability: 99 }).durability, 3);
  assert.equal(parseTcoInputs({ ...input, domain: '<b>x</b>' }).domain, '');
});

test('calculator: cererea intră ca ofertă, cu cifrele recalculate pe server', () => {
  const calculator = { employees: 20, categories: ['manusi'], months: 3, durability: 1.5, adminHours: 2, hourCost: 40,
    results: { totalNow: 999999999 } };
  const r = parseLead({ intent: 'quote', data: { ...valid.data, calculator } });
  assert.equal(r.ok, true);
  assert.equal(r.lead.answers[0].answer, 'Calculatorul de cost (estimare orientativă)');
  const cost = r.lead.answers.find((a) => a.question === 'calc_cost_acum').answer;
  assert.equal(cost.includes('999'), false); // cifrele din browser se ignoră
  assert.ok(r.lead.answers.length <= 30); // limita de import din CRM
  assert.equal(parseLead({ intent: 'quote', data: { ...valid.data, calculator: { employees: 3 } } }).ok, false);
});

test('email: doar text, fără CR/LF în subiect, cu tag website', () => {
  const lead = { ...parseLead({ ...valid, data: { ...valid.data, company: 'Rău\r\nBcc: x@y.ro' } }).lead,
    id: 'id', createdAt: '2026-11-16T00:00:00Z', environment: 'production', sourceUrl: null };
  const { subject, text } = leadEmail(lead);
  assert.equal(/[\r\n]/.test(subject), false);
  assert.match(subject, /^\[website\] Cerere de ofertă: /);
  assert.match(text, /tag: website/);
  assert.match(leadEmail({ ...lead, environment: 'preview' }).subject, /^\[TEST\]/);
});

test('environmentOf și safeEqual', () => {
  assert.equal(environmentOf('youprotect.ro'), 'production');
  assert.equal(environmentOf('feature-x.youprotect-website.pages.dev'), 'preview');
  assert.equal(safeEqual('abc', 'abc'), true);
  assert.equal(safeEqual('abc', 'abd'), false);
  assert.equal(safeEqual('abc', 'abcd'), false);
});

test('submit-lead: salvează în D1 și trimite emailul', async () => {
  const db = fakeD1();
  const calls = stubFetch(200);
  const c = ctx(valid, { env: { LEADS_DB: db, RESEND_API_KEY: 'k' } });
  const res = await submitLead(c);
  assert.equal(res.status, 200);
  await Promise.all(c.pending);
  assert.equal(db.rows.length, 1);
  assert.equal(db.rows[0].tag, 'website');
  assert.equal(db.rows[0].environment, 'production');
  assert.ok(db.rows[0].email_sent_at);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].body.to, ['office@youprotect.ro']);
  assert.equal(calls[0].body.reply_to, 'ion@exemplu.ro');
  assert.deepEqual(calls[0].body.tags[0], { name: 'source', value: 'website' });
});

test('submit-lead: D1 căzut -> tot reușește prin email', async () => {
  const calls = stubFetch(200);
  const res = await submitLead(ctx(valid, { env: { LEADS_DB: fakeD1({ failInsert: true }), RESEND_API_KEY: 'k' } }));
  assert.equal(res.status, 200);
  assert.equal(calls.length, 1);
});

test('submit-lead: ambele căi căzute -> 500, fără mesaj intern', async () => {
  stubFetch(500);
  const res = await submitLead(ctx(valid, { env: { LEADS_DB: fakeD1({ failInsert: true }), RESEND_API_KEY: 'k' } }));
  assert.equal(res.status, 500);
  const body = await res.json();
  assert.equal(body.success, false);
  assert.equal(JSON.stringify(body).includes('D1 down'), false);
});

test('submit-lead: date invalide -> 400', async () => {
  const res = await submitLead(ctx({ intent: 'quote', data: { name: 'x' } }, { env: { LEADS_DB: fakeD1() } }));
  assert.equal(res.status, 400);
});

test('crm: fără token -> 401; cu token -> cererile de producție, apoi ack', async () => {
  const db = fakeD1();
  stubFetch(200);
  const env = { LEADS_DB: db, RESEND_API_KEY: 'k', CRM_SYNC_TOKEN: TOKEN };
  await submitLead(ctx(valid, { env }));
  await submitLead(ctx(valid, { env, host: 'preview.youprotect-website.pages.dev' }));

  const unauth = await crmGet({ request: new Request('https://youprotect.ro/api/crm/leads'), env });
  assert.equal(unauth.status, 401);
  const wrong = await crmGet({
    request: new Request('https://youprotect.ro/api/crm/leads', { headers: { Authorization: `Bearer ${'y'.repeat(40)}` } }),
    env,
  });
  assert.equal(wrong.status, 401);

  const auth = { Authorization: `Bearer ${TOKEN}` };
  const list = await (await crmGet({ request: new Request('https://youprotect.ro/api/crm/leads', { headers: auth }), env })).json();
  assert.equal(list.leads.length, 1); // doar producția
  assert.equal(list.leads[0].tag, 'website');
  assert.ok(Array.isArray(list.leads[0].answers));

  const withPreview = await (
    await crmGet({ request: new Request('https://youprotect.ro/api/crm/leads?include_preview=1', { headers: auth }), env })
  ).json();
  assert.equal(withPreview.leads.length, 2);

  const ack = await crmPost({
    request: new Request('https://youprotect.ro/api/crm/leads', {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ acks: [{ id: list.leads[0].id, crmRef: 'opp-1' }, { id: 'nu-e-uuid' }] }),
    }),
    env,
  });
  assert.equal((await ack.json()).acknowledged, 1);
  const after = await (await crmGet({ request: new Request('https://youprotect.ro/api/crm/leads', { headers: auth }), env })).json();
  assert.equal(after.leads.length, 0);
});

test('crm: token prea scurt în configurație -> refuză tot', async () => {
  const env = { LEADS_DB: fakeD1(), CRM_SYNC_TOKEN: 'scurt' };
  const res = await crmGet({ request: new Request('https://youprotect.ro/api/crm/leads', { headers: { Authorization: 'Bearer scurt' } }), env });
  assert.equal(res.status, 401);
});

test('parseLead: „detalii” (cantități, mărimi, coduri) doar la cererea de ofertă, tăiat la 1000 de caractere', async () => {
  const { DETAILS_MAX_LENGTH } = await import('../server/leads.js');
  const quote = parseLead({ ...valid, data: { ...valid.data, detalii: '  20 de perechi, 40–46\n10 căști  ' } });
  assert.deepEqual(quote.lead.answers.find((a) => a.question === 'detalii'), {
    question: 'detalii',
    label: 'Cantități, mărimi, coduri',
    answer: '20 de perechi, 40–46\n10 căști',
  });
  const long = parseLead({ ...valid, data: { ...valid.data, detalii: 'x'.repeat(5000) } });
  assert.equal(long.lead.answers.find((a) => a.question === 'detalii').answer.length, DETAILS_MAX_LENGTH);
  assert.equal(parseLead({ ...valid, data: { ...valid.data, detalii: '   ' } }).lead.answers.some((a) => a.question === 'detalii'), false);
  assert.equal(parseLead({ ...valid, data: { ...valid.data, detalii: 42 } }).lead.answers.some((a) => a.question === 'detalii'), false);
  // La programare, câmpul liber are altă etichetă (D-2026-11-20-06).
  const consultation = parseLead({ intent: 'consultation', data: { ...valid.data, detalii: 'schimbăm furnizorul' } });
  assert.deepEqual(consultation.lead.answers.find((a) => a.question === 'detalii'), {
    question: 'detalii',
    label: 'Despre ce vrea să vorbim',
    answer: 'schimbăm furnizorul',
  });
});

test('parseLead: programarea trimite doar rolul, echipa și domeniul (fără vechile întrebări de sondaj)', () => {
  const r = parseLead({
    intent: 'consultation',
    data: { ...valid.data, q1: 'Achiziții / Aprovizionare', q2: '16–40 persoane', q3: 'Construcții', q4: ['x'], q5: ['y'], q6: 'z' },
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.lead.answers.map((a) => a.question), ['q1', 'q2', 'q3']);
});

test('parseLead: venit de pe o fișă de produs, fără „Produse vizate” (q3)', () => {
  const { q3, ...withoutQ3 } = valid.data;
  const r = parseLead({ ...valid, data: withoutQ3 });
  assert.equal(r.ok, true);
  assert.equal(r.lead.product, 'tricou-polo-mascot-bandol-51587');
  assert.equal(r.lead.answers.some((a) => a.question === 'q3'), false);
});
