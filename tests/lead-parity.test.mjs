// Valori care trebuie să rămână identice în pagină și pe server, sau între fișiere (auditul din 20.11.2026, nr. 19).
// Fiecare test pică dacă cineva schimbă doar o parte.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LEAD_QUESTIONS } from '../src/lib/lead-questions.js';
import { QUESTIONS, QUESTION_LABELS } from '../server/leads.js';
import { ORDER_MONTH_ANSWERS, ORDER_MONTH_KEY } from '../src/lib/lead-limits.js';
import { CATEGORY_PRODUCTS_OPTION, QUOTE_CATEGORIES } from '../src/lib/quote-categories.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const sourceFiles = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : /\.(astro|tsx?|jsx?|mjs)$/.test(name) ? [path] : [];
  });
const SRC = sourceFiles(fileURLToPath(new URL('../src', import.meta.url)));

test('întrebările: serverul și formularul folosesc aceeași listă, fiecare cu etichetă pentru CRM', () => {
  assert.equal(QUESTIONS, LEAD_QUESTIONS);
  for (const intent of Object.keys(LEAD_QUESTIONS)) {
    assert.deepEqual(Object.keys(QUESTION_LABELS[intent]).sort(), [...LEAD_QUESTIONS[intent]].sort(), intent);
  }
  const form = read('src/components/forms/MultiStepForm.tsx');
  assert.match(form, /\[\.\.\.LEAD_QUESTIONS\.consultation, 'contact'\]/);
  assert.match(form, /\[\.\.\.LEAD_QUESTIONS\.quote, 'contact'\]/);
  for (const id of new Set(Object.values(LEAD_QUESTIONS).flat())) {
    assert.match(form, new RegExp(`stepId === '${id}'`), `formularul nu are pasul ${id}`);
  }
});

test('luna comenzii: lista și cheia sunt definite o singură dată, în lead-limits.js', () => {
  assert.equal(ORDER_MONTH_ANSWERS.length, 14);
  assert.equal(new Set(ORDER_MONTH_ANSWERS).size, 14);
  for (const answer of ORDER_MONTH_ANSWERS) {
    assert.ok(answer.length <= 40, answer);
    assert.doesNotMatch(answer, /[<>\n\r]/, answer);
    assert.equal(answer, answer.trim());
  }
  assert.ok(ORDER_MONTH_KEY.length <= 40); // limita importerului CRM
  assert.equal(ORDER_MONTH_KEY, 'luna_comenzii');
  for (const intent of Object.keys(QUESTIONS)) assert.equal(QUESTIONS[intent].includes(ORDER_MONTH_KEY), false, intent);

  const form = read('src/components/forms/MultiStepForm.tsx');
  const limitsImport = (text) => text.match(/import\s*\{[^}]*\}\s*from\s*'[^']*lead-limits\.js'/)?.[0] ?? '';
  for (const name of ['ORDER_MONTH_KEY', 'ORDER_MONTH_ANSWERS']) {
    assert.match(limitsImport(form), new RegExp(`\\b${name}\\b`), `formularul nu importă ${name} din lead-limits.js`);
  }
  assert.match(form, /ORDER_MONTH_ANSWERS\.map\(/);
  assert.doesNotMatch(form, /'ianuarie'|'decembrie'|luna_comenzii/);

  const server = read('server/leads.js');
  for (const name of ['ORDER_MONTH_KEY', 'ORDER_MONTH_ANSWERS']) {
    assert.match(limitsImport(server), new RegExp(`\\b${name}\\b`), `serverul nu importă ${name} din lead-limits.js`);
  }
  assert.doesNotMatch(server, /'ianuarie'|'decembrie'|'luna_comenzii'|'De mai multe ori pe an'/);

  for (const file of SRC) {
    if (file.endsWith('lead-limits.js')) continue;
    assert.doesNotMatch(readFileSync(file, 'utf8'), /De mai multe ori pe an/, file);
  }
});

test('categoriile de pe homepage bifează o variantă existentă la „Ce produse ai în vedere?”', () => {
  assert.deepEqual(Object.keys(CATEGORY_PRODUCTS_OPTION).sort(), Object.keys(QUOTE_CATEGORIES).sort());
  const form = read('src/components/forms/MultiStepForm.tsx');
  assert.match(form, /\{ label: SSM_OPTION \}/);
  assert.match(form, /\{ label: HEIGHT_OPTION \}/);
});

test('calculatorul: capetele sliderelor vin din TCO_LIMITS, nu sunt scrise de mână', () => {
  assert.doesNotMatch(read('src/components/calculator/TCOCalculator.tsx'), /\b(min|max)=\{\d+\}/);
});

test('cheile din browser și linkul WhatsApp pentru echipe mici sunt definite o singură dată', () => {
  for (const file of SRC) {
    if (file.endsWith('session-keys.js')) continue;
    const text = readFileSync(file, 'utf8');
    assert.doesNotMatch(text, /['"]yp_(booking_prefill|lead)['"]/, file);
    if (!file.endsWith('quote-list.js')) assert.doesNotMatch(text, /['"]yp_quote_list['"]/, file);
    if (!file.endsWith('whatsapp.ts')) assert.doesNotMatch(text, /Am o echipă de 1–4 persoane și aș vrea/, file);
  }
});

test('JSON-LD trece prin jsonLd() (escapează „<”), nu prin JSON.stringify direct', () => {
  for (const file of SRC.filter((f) => f.endsWith('.astro'))) {
    assert.doesNotMatch(readFileSync(file, 'utf8'), /set:html=\{JSON\.stringify\(/, file);
  }
});
