// Trimiterea cererii din formulare: mesajul serverului ajunge la vizitator la refuzuri (4xx), nu la erori de server.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { postLead } from '../src/lib/post-lead.js';
import { EMAIL_REGEX } from '../src/lib/lead-limits.js';

const respond = (status, body) => {
  globalThis.fetch = async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
};

test('postLead: succes, refuz cu mesaj, eroare de server fără mesaj', async () => {
  respond(200, { success: true });
  assert.deepEqual(await postLead({}), { ok: true, message: null });
  respond(429, { success: false, error: 'Am primit deja mai multe cereri de la tine în ultima oră.' });
  assert.deepEqual(await postLead({}), { ok: false, message: 'Am primit deja mai multe cereri de la tine în ultima oră.' });
  respond(400, 'nu e json');
  assert.deepEqual(await postLead({}), { ok: false, message: null });
  respond(500, { success: false, error: 'Nu am putut trimite cererea.' });
  assert.deepEqual(await postLead({}), { ok: false, message: null });
});

test('EMAIL_REGEX: aceeași regulă în pagină și pe server', () => {
  assert.equal(EMAIL_REGEX.test('ion@firma.ro'), true);
  assert.equal(EMAIL_REGEX.test('ion@@firma.ro'), false);
  assert.equal(EMAIL_REGEX.test('ion@firma'), false);
  assert.equal(EMAIL_REGEX.test('ion popescu@firma.ro'), false);
});
