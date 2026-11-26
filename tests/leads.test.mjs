// Teste pentru fluxul cererilor de pe site: node --test tests/
// D1 și Resend sunt simulate; nimic nu pleacă în rețea.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidCUI, normalizeCUI } from '../src/lib/cui.js';
import { parseLead, leadEmail, environmentOf, safeEqual, HONEYPOT_FIELD, MAX_LEADS_PER_IP_PER_HOUR } from '../server/leads.js';
import { computeTco, parseTcoInputs, TCO_CATEGORIES } from '../src/lib/tco.js';
import { DOMAINS } from '../src/lib/domains.js';
import { DETAILS_MAX_LENGTH } from '../src/lib/lead-limits.js';
import { PERSONALIZATION_ANSWERS, QUOTE_CATEGORIES } from '../src/lib/quote-categories.js';
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
            const ip = stmt.args[14];
            rows.push({ id, created_at, environment, tag, intent, name, company, cui, phone, email, product, answers, ip, synced_at: null });
          } else if (sql.startsWith('UPDATE lead SET email_sent_at')) {
            const row = rows.find((r) => r.id === stmt.args[0]);
            if (row) Object.assign(row, { email_sent_at: stmt.args[1], email_error: stmt.args[2] });
          } else if (sql.startsWith('UPDATE lead SET synced_at')) {
            const row = rows.find((r) => r.id === stmt.args[0] && !r.synced_at);
            if (row) Object.assign(row, { synced_at: stmt.args[1], crm_ref: stmt.args[2] });
          } else if (sql.startsWith('DELETE FROM lead WHERE synced_at IS NOT NULL AND synced_at < ?1')) {
            for (let i = rows.length - 1; i >= 0; i -= 1) if (rows[i].synced_at && rows[i].synced_at < stmt.args[0]) rows.splice(i, 1);
          } else {
            throw new Error(`SQL necunoscut în fakeD1: ${sql}`);
          }
          return { success: true };
        },
        async first() {
          if (!sql.startsWith('SELECT COUNT(*) AS n FROM lead WHERE ip = ?1 AND created_at > ?2')) throw new Error(`SQL necunoscut: ${sql}`);
          const [ip, since] = stmt.args;
          return { n: rows.filter((r) => r.ip === ip && r.created_at > since).length };
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

function ctx(body, { host = 'youprotect.ro', env = {}, origin = `https://${host}`, ip = '203.0.113.7' } = {}) {
  const pending = [];
  const headers = { 'Content-Type': 'application/json', Referer: `https://${host}/cere-oferta/`, 'CF-Connecting-IP': ip };
  if (origin) headers.Origin = origin;
  return {
    request: new Request(`https://${host}/api/submit-lead`, {
      method: 'POST',
      headers,
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

const MONTH_ANSWERS = [
  'ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie',
  'noiembrie', 'decembrie', 'De mai multe ori pe an', 'Nu știu încă',
];
const withMonth = (intent, value) =>
  parseLead({ intent, data: { ...valid.data, q1: intent === 'quote' ? '16–40' : 'Administrator', luna_comenzii: value } });
const monthAnswer = (r) => r.lead.answers.find((a) => a.question === 'luna_comenzii');

test('parseLead: luna comenzii, cele 14 valori din listă, la ambele intenții, după „detalii”', () => {
  for (const intent of ['quote', 'consultation']) {
    for (const month of MONTH_ANSWERS) {
      const r = withMonth(intent, month);
      assert.equal(r.ok, true);
      assert.deepEqual(monthAnswer(r), { question: 'luna_comenzii', label: 'În ce lună comandă de obicei', answer: month });
    }
  }
  const r = parseLead({ intent: 'quote', data: { ...valid.data, detalii: 'ceva', luna_comenzii: 'martie' } });
  assert.deepEqual(r.lead.answers.map((a) => a.question).slice(-2), ['detalii', 'luna_comenzii']);
});

test('parseLead: luna comenzii lipsă, goală sau nepermisă se ignoră, cererea rămâne validă', () => {
  const nothing = withMonth('quote', undefined);
  assert.equal(monthAnswer(nothing), undefined);
  // Spațiile din jur se taie (ca la celelalte câmpuri), deci „martie ” e identic cu „martie”.
  assert.equal(monthAnswer(withMonth('quote', ' martie ')).answer, 'martie');
  for (const empty of ['', '   ']) assert.equal(monthAnswer(withMonth('quote', empty)), undefined);
  const bad = [
    'Martie', 'Ianuarie', 'martie\niulie', '<b>martie</b>', '<script>alert(1)</script>', 'constructor', '__proto__',
    'toString', 'martie; iulie', ['martie'], 3, true, { 0: 'martie' }, 'x'.repeat(5000),
  ];
  for (const intent of ['quote', 'consultation']) {
    for (const value of bad) {
      const r = withMonth(intent, value);
      assert.equal(r.ok, true, JSON.stringify(value));
      assert.equal(monthAnswer(r), undefined, JSON.stringify(value));
      // Restul răspunsurilor rămân.
      assert.equal(r.lead.answers[0].question, 'q1');
    }
  }
});

test('email: luna comenzii apare ca text simplu, valoarea nepermisă nu ajunge în email', () => {
  const base = { id: 'id', createdAt: '2026-11-26T00:00:00Z', environment: 'production', sourceUrl: null };
  const ok = leadEmail({ ...withMonth('quote', 'martie').lead, ...base });
  assert.match(ok.text, /^- În ce lună comandă de obicei: martie$/m);
  const bad = leadEmail({ ...withMonth('quote', '<script>x</script>\nBcc: a@b.ro').lead, ...base });
  assert.equal(bad.text.includes('În ce lună'), false);
  // nosemgrep: javascript.lang.security.audit.unknown-value-with-script-tag.unknown-value-with-script-tag -- fals pozitiv: șir de test într-o aserțiune, nu HTML randat
  assert.equal(bad.text.includes('<script>'), false);
  assert.equal(bad.text.includes('Bcc:'), false);
});

test('submit-lead: luna comenzii ajunge în coloana answers din D1', async () => {
  const db = fakeD1();
  stubFetch(200);
  const body = { intent: 'consultation', data: { ...valid.data, luna_comenzii: 'De mai multe ori pe an' } };
  const c = ctx(body, { env: { LEADS_DB: db, RESEND_API_KEY: 'k' } });
  const res = await submitLead(c);
  assert.equal(res.status, 200);
  await Promise.all(c.pending);
  const saved = JSON.parse(db.rows[0].answers);
  assert.deepEqual(saved.find((a) => a.question === 'luna_comenzii'), {
    question: 'luna_comenzii',
    label: 'În ce lună comandă de obicei',
    answer: 'De mai multe ori pe an',
  });
  // Valoare nepermisă: cererea se salvează, fără cheia în answers.
  const db2 = fakeD1();
  const c2 = ctx({ ...body, data: { ...body.data, luna_comenzii: 'Martie' } }, { env: { LEADS_DB: db2, RESEND_API_KEY: 'k' } });
  assert.equal((await submitLead(c2)).status, 200);
  await Promise.all(c2.pending);
  assert.equal(JSON.parse(db2.rows[0].answers).some((a) => a.question === 'luna_comenzii'), false);
});

test('parseLead: luna comenzii, variante care arată ca o lună dar nu sunt în listă (Unicode, caractere de control)', () => {
  const lookalikes = [
    'mar\u200Btie', // zero-width space în interior
    'martie\u200B', // zero-width space la capăt (trim() nu-l taie)
    'mar\u0000tie', // NUL
    'martie\u0007', // caracter de control la capăt
    'm\u0430rtie', // „а” chirilic (U+0430) în loc de „a”
    '\u0456unie', // „і” chirilic (U+0456) în loc de „i”
    '\uFF4D\uFF41\uFF52\uFF54\uFF49\uFF45', // litere full-width
    '\u201Emartie\u201D',
    '\u00ABmartie\u00BB',
    'martie\u0301', // accent combinat
    'Nu s\u0327tiu încă', // s + U+0327 (sedilă combinată), nu „ș” (U+0219)
    'Nu \u015Ftiu încă', // „ş” cu sedilă (U+015F), nu cu virgulă (U+0219)
    'Nu știu încă'.normalize('NFD'), // „ș” ca s + U+0326 (virgulă combinată)
    'De mai multe ori pe an.', // punct în plus
    'De  mai multe ori pe an', // spațiu dublu
    'Nu stiu inca', // fără diacritice
  ];
  for (const intent of ['quote', 'consultation']) {
    for (const value of lookalikes) {
      const r = withMonth(intent, value);
      assert.equal(r.ok, true, JSON.stringify(value));
      assert.equal(monthAnswer(r), undefined, JSON.stringify(value));
    }
  }
  // Spațiile Unicode de la capete (NBSP, BOM, tab, CR/LF) se taie ca la celelalte câmpuri; se salvează oricum valoarea
  // exactă din listă, nu cea trimisă de client.
  for (const padded of ['\u00A0martie\u00A0', '\uFEFFmartie', '\t\nmartie\r\n', `${' '.repeat(50_000)}martie`]) {
    const r = withMonth('quote', padded);
    assert.equal(monthAnswer(r).answer, 'martie');
    assert.ok(MONTH_ANSWERS.includes(monthAnswer(r).answer));
  }
});

test('parseLead: luna comenzii nu se poate strecura prin q_other, __proto__ sau constructor', () => {
  const base = { name: 'Ion', company: 'Exemplu SRL', email: 'ion@exemplu.ro', phone: '0722123456', q1: '16–40' };
  // q_other se aplică doar întrebărilor din formular: nici nu schimbă luna, nici nu o adaugă.
  const viaOther = parseLead({ intent: 'quote', data: { ...base, q_other: { luna_comenzii: 'iulie' } } });
  assert.equal(viaOther.ok, true);
  assert.equal(monthAnswer(viaOther), undefined);
  const both = parseLead({ intent: 'quote', data: { ...base, luna_comenzii: 'martie', q_other: { luna_comenzii: 'iulie' } } });
  assert.equal(monthAnswer(both).answer, 'martie');
  // JSON-ul de la client are „__proto__” ca proprietate proprie, nu ca prototip.
  const raw = '{"name":"Ion","company":"Exemplu SRL","email":"ion@exemplu.ro","q1":"16–40",'
    + '"__proto__":{"luna_comenzii":"martie"},"constructor":{"luna_comenzii":"martie"},"q_other":{"__proto__":{"luna_comenzii":"x"}}}';
  for (const intent of ['quote', 'consultation']) {
    const r = parseLead({ intent, data: JSON.parse(raw) });
    assert.equal(r.ok, true);
    assert.equal(monthAnswer(r), undefined);
  }
  assert.equal(Object.prototype.luna_comenzii, undefined);
  // Cu valoare permisă, luna nu intră de două ori.
  const r = withMonth('quote', 'martie');
  assert.equal(r.lead.answers.filter((a) => a.question === 'luna_comenzii').length, 1);
});

test('luna comenzii: cererea completă încape în limitele CRM (≤ 30 de răspunsuri, cheie ≤ 40, răspuns ≤ 2000)', () => {
  const cats = Object.keys(TCO_CATEGORIES);
  const calculator = {
    domain: DOMAINS[0], employees: 200, durability: 3, adminHours: 40, hourCost: 150, categories: cats,
    prices: Object.fromEntries(cats.map((c) => [c, 4999.99])),
    qualityPrices: Object.fromEntries(cats.map((c) => [c, 4999.99])),
    months: Object.fromEntries(cats.map((c) => [c, 6])),
    qty: Object.fromEntries(cats.map((c) => [c, 50])),
  };
  const produse = Array.from({ length: 15 }, (_, i) => `produs-cod${i}-${'x'.repeat(60)}`);
  const r = parseLead({
    intent: 'quote',
    data: {
      name: 'Ion', company: 'Exemplu SRL', email: 'ion@exemplu.ro', phone: '0722123456',
      q1: '16–40', q2: DOMAINS[0], q3: ['Încălțăminte de protecție'], personalizare: PERSONALIZATION_ANSWERS[0], q4: 'a', q5: ['b'],
      q6: 'c', q7: 'd', detalii: 'x'.repeat(DETAILS_MAX_LENGTH), luna_comenzii: 'De mai multe ori pe an',
      categorie: Object.keys(QUOTE_CATEGORIES)[0], calculator, produse,
    },
  });
  assert.equal(r.ok, true);
  assert.ok(r.lead.answers.length <= 30, `răspunsuri: ${r.lead.answers.length}`);
  assert.ok(monthAnswer(r));
  for (const a of r.lead.answers) {
    assert.ok(a.question.length <= 40, a.question);
    assert.ok(a.answer.length <= 2000, `${a.question}: ${a.answer.length}`);
  }
});

test('luna comenzii: ajunge neschimbată din formular prin D1 în GET /api/crm/leads (ambele intenții)', async () => {
  const db = fakeD1();
  stubFetch(200);
  const env = { LEADS_DB: db, RESEND_API_KEY: 'k', CRM_SYNC_TOKEN: TOKEN };
  for (const intent of ['quote', 'consultation']) {
    const body = { intent, data: { ...valid.data, q1: intent === 'quote' ? '16–40' : 'Administrator', detalii: 'ceva', luna_comenzii: 'Nu știu încă' } };
    const c = ctx(body, { env, ip: intent === 'quote' ? '203.0.113.10' : '203.0.113.11' });
    assert.equal((await submitLead(c)).status, 200);
    await Promise.all(c.pending);
  }
  const auth = { Authorization: `Bearer ${TOKEN}` };
  const { leads } = await (await crmGet({ request: new Request('https://youprotect.ro/api/crm/leads', { headers: auth }), env })).json();
  assert.equal(leads.length, 2);
  for (const lead of leads) {
    assert.deepEqual(lead.answers.find((a) => a.question === 'luna_comenzii'), {
      question: 'luna_comenzii',
      label: 'În ce lună comandă de obicei',
      answer: 'Nu știu încă',
    });
    assert.ok(lead.answers.some((a) => a.question === 'detalii'));
  }
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
  assert.equal(parseTcoInputs({ ...input, employees: 1e9, durability: 99 }).employees, 200); // capătul sliderului
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
  assert.equal(environmentOf('youprotect-website.pages.dev'), 'production'); // aliasul de producție Cloudflare
  assert.equal(environmentOf('feature-x.youprotect-website.pages.dev'), 'preview');
  assert.equal(environmentOf('d889720d.youprotect-website.pages.dev'), 'preview');
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
  assert.equal('stage' in body, false); // nu spunem ce a căzut
});

test('submit-lead: fără Origin sau de pe alt site -> 403, nimic salvat', async () => {
  const db = fakeD1();
  const calls = stubFetch(200);
  const env = { LEADS_DB: db, RESEND_API_KEY: 'k' };
  assert.equal((await submitLead(ctx(valid, { env, origin: null }))).status, 403);
  assert.equal((await submitLead(ctx(valid, { env, origin: 'https://spam.example' }))).status, 403);
  assert.equal((await submitLead(ctx(valid, { env, origin: 'http://youprotect.ro' }))).status, 403);
  assert.equal(db.rows.length, 0);
  assert.equal(calls.length, 0);
});

test('submit-lead: câmpul-capcană completat -> „succes”, dar nimic salvat sau trimis', async () => {
  const db = fakeD1();
  const calls = stubFetch(200);
  const c = ctx({ ...valid, data: { ...valid.data, [HONEYPOT_FIELD]: 'https://spam.example' } }, { env: { LEADS_DB: db, RESEND_API_KEY: 'k' } });
  const res = await submitLead(c);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).success, true);
  await Promise.all(c.pending);
  assert.equal(db.rows.length, 0);
  assert.equal(calls.length, 0);
  // Câmpul gol (oamenii) nu blochează nimic.
  const ok = await submitLead(ctx({ ...valid, data: { ...valid.data, [HONEYPOT_FIELD]: '  ' } }, { env: { LEADS_DB: db } }));
  assert.equal(ok.status, 200);
  assert.equal(db.rows.length, 1);
});

test('submit-lead: cel mult MAX_LEADS_PER_IP_PER_HOUR cereri pe oră de la același IP', async () => {
  const db = fakeD1();
  stubFetch(200);
  const env = { LEADS_DB: db };
  for (let i = 0; i < MAX_LEADS_PER_IP_PER_HOUR; i += 1) assert.equal((await submitLead(ctx(valid, { env }))).status, 200);
  const blocked = await submitLead(ctx(valid, { env }));
  assert.equal(blocked.status, 429);
  assert.match((await blocked.json()).error, /ultima oră/);
  assert.equal(db.rows.length, MAX_LEADS_PER_IP_PER_HOUR);
  // Alt IP trece; cererile mai vechi de o oră nu se mai numără.
  assert.equal((await submitLead(ctx(valid, { env, ip: '198.51.100.9' }))).status, 200);
  for (const r of db.rows) r.created_at = new Date(Date.now() - 2 * 3_600_000).toISOString();
  assert.equal((await submitLead(ctx(valid, { env }))).status, 200);
});

test('crm: cererile preluate se șterg după 30 de zile, la GET și la POST (data comparată în format ISO)', async () => {
  const db = fakeD1();
  const env = { LEADS_DB: db, CRM_SYNC_TOKEN: TOKEN };
  const auth = { Authorization: `Bearer ${TOKEN}` };
  const daysAgo = (d, h = 0) => new Date(Date.now() - d * 86_400_000 - h * 3_600_000).toISOString();
  db.rows.push(
    { id: 'vechi', environment: 'production', created_at: daysAgo(40), synced_at: daysAgo(30, 1) }, // o oră peste limită
    { id: 'recent', environment: 'production', created_at: daysAgo(20), synced_at: daysAgo(29, 23) },
    { id: 'nepreluat', environment: 'production', created_at: daysAgo(45), synced_at: null },
  );
  await crmGet({ request: new Request('https://youprotect.ro/api/crm/leads', { headers: auth }), env });
  assert.deepEqual(db.rows.map((r) => r.id).sort(), ['nepreluat', 'recent']);
  db.rows.find((r) => r.id === 'recent').synced_at = daysAgo(31);
  await crmPost({
    request: new Request('https://youprotect.ro/api/crm/leads', { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: '{"acks":[]}' }),
    env,
  });
  assert.deepEqual(db.rows.map((r) => r.id), ['nepreluat']); // nepreluate rămân până le ia CRM-ul
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

test('parseLead: lista de ofertă — primul produs rămâne `product`, lista pleacă și ca răspuns „produse”', () => {
  const { produs, ...rest } = valid.data;
  const list = ['tricou-polo-mascot-bandol-51587', 'geaca-iarna-reflectorizanta-mascot-accelerate-safe-19035'];
  const r = parseLead({ ...valid, data: { ...rest, produse: [...list, list[0], 'Rău!', '<script>', 42, null] } });
  assert.equal(r.ok, true);
  assert.equal(r.lead.product, list[0]);
  assert.deepEqual(r.lead.answers[0], {
    question: 'produse',
    label: 'Produse din lista de ofertă',
    answer: list.map((s) => `https://youprotect.ro/produse/${s}/`).join('\n'),
  });
  // Un singur produs: ca înainte, fără răspunsul „produse”.
  const one = parseLead({ ...valid, data: { ...rest, produse: [list[1]] } });
  assert.equal(one.lead.product, list[1]);
  assert.equal(one.lead.answers.some((a) => a.question === 'produse'), false);
  // Paginile vechi trimit `produs`; nu e listă: ignorat.
  assert.equal(parseLead({ ...valid, data: { ...rest, produse: 'tricou-polo-mascot-bandol-51587' } }).lead.product, null);
});

test('parseLead: lista de ofertă are cel mult 15 produse și încape în răspunsul din CRM (2000 de caractere)', () => {
  const longSlug = (i) => `${'a'.repeat(97)}-${String(i).padStart(2, '0')}`;
  const slugs = Array.from({ length: 40 }, (_, i) => longSlug(i));
  assert.ok(slugs.every((s) => s.length === 100));
  const r = parseLead({ ...valid, data: { ...valid.data, produs: undefined, produse: slugs } });
  const answer = r.lead.answers.find((a) => a.question === 'produse').answer;
  assert.equal(answer.split('\n').length, 15);
  assert.ok(answer.length <= 2000, `${answer.length} caractere`);
  // Slug-urile peste 100 de caractere nu trec.
  assert.equal(parseLead({ ...valid, data: { ...valid.data, produs: `a-${'b'.repeat(100)}` } }).lead.product, null);
});

test('email: lista de ofertă, câte un produs pe rând, nu și printre răspunsuri', () => {
  const list = ['tricou-polo-mascot-bandol-51587', 'geaca-iarna-reflectorizanta-mascot-accelerate-safe-19035'];
  const lead = { ...parseLead({ ...valid, data: { ...valid.data, produs: undefined, produse: list } }).lead,
    id: 'id', createdAt: '2026-11-20T00:00:00Z', environment: 'production', sourceUrl: null };
  const { text } = leadEmail(lead);
  assert.match(text, /Produse \(2\):\n- https:\/\/youprotect\.ro\/produse\/tricou-polo-mascot-bandol-51587\/\n- https:\/\/youprotect\.ro\/produse\/geaca-/);
  assert.doesNotMatch(text, /Produse din lista de ofertă/);
  assert.doesNotMatch(text, /^Produs: /m);
  // Un singur produs: rândul „Produs:” de până acum.
  assert.match(leadEmail({ ...lead, ...parseLead(valid).lead }).text, /^Produs: https:\/\/youprotect\.ro\/produse\/tricou-polo-mascot-bandol-51587\/$/m);
});
