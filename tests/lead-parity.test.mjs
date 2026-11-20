// Valori care trebuie să rămână identice în pagină și pe server, sau între fișiere (auditul din 20.11.2026, nr. 19).
// Fiecare test pică dacă cineva schimbă doar o parte.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LEAD_QUESTIONS } from '../src/lib/lead-questions.js';
import { QUESTIONS, QUESTION_LABELS } from '../server/leads.js';
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
